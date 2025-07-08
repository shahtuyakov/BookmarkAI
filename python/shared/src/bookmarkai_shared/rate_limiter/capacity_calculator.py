#!/usr/bin/env python3
"""
Capacity Planning Calculator for Rate Limits
Helps determine required API tiers and costs based on usage patterns
"""
import json
import argparse
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

console = Console()

@dataclass
class APITier:
    """Represents an API service tier"""
    name: str
    requests_per_minute: int
    tokens_per_minute: Optional[int]
    concurrent_limit: Optional[int]
    cost_per_month: float
    cost_per_request: Optional[float]
    cost_per_token: Optional[float]

@dataclass
class UsagePattern:
    """Expected usage pattern"""
    users: int
    shares_per_user_per_day: float
    peak_hour_multiplier: float = 3.0  # Peak hour has 3x average traffic
    platform_distribution: Dict[str, float] = None  # e.g., {'tiktok': 0.5, 'reddit': 0.3}
    average_tokens_per_request: int = 500
    premium_user_percentage: float = 0.1

# Known API tiers (simplified examples)
API_TIERS = {
    'openai': [
        APITier('gpt-3.5-free', 3, 40000, None, 0, 0.0005, 0.0000015),
        APITier('gpt-3.5-tier1', 3500, 90000, None, 20, 0.0005, 0.0000015),
        APITier('gpt-3.5-tier2', 5000, 160000, None, 50, 0.0005, 0.0000015),
        APITier('gpt-4-tier1', 500, 150000, None, 100, 0.03, 0.00001),
        APITier('gpt-4-tier2', 5000, 300000, None, 500, 0.03, 0.00001),
    ],
    'whisper': [
        APITier('whisper-free', 50, None, 5, 0, 0.006, None),
        APITier('whisper-paid', 500, None, 50, 20, 0.006, None),
    ],
    'embeddings': [
        APITier('embeddings-free', 3000, 1000000, None, 0, None, 0.0001),
        APITier('embeddings-paid', 10000, 5000000, None, 20, None, 0.0001),
    ],
}

class CapacityCalculator:
    """Calculate required capacity and costs"""
    
    def calculate_requirements(self, usage: UsagePattern) -> Dict[str, Dict]:
        """Calculate requirements for each service"""
        results = {}
        
        # Total daily shares
        total_daily_shares = usage.users * usage.shares_per_user_per_day
        
        # Premium vs standard split
        premium_shares = total_daily_shares * usage.premium_user_percentage * 3  # Premium users 3x more active
        standard_shares = total_daily_shares * (1 - usage.premium_user_percentage)
        total_daily_shares = premium_shares + standard_shares
        
        # Peak hour calculations (assuming 20% of daily traffic in peak hour)
        peak_hour_shares = total_daily_shares * 0.2 * usage.peak_hour_multiplier
        peak_minute_shares = peak_hour_shares / 60
        
        # Platform distribution
        if not usage.platform_distribution:
            usage.platform_distribution = {
                'tiktok': 0.4,
                'reddit': 0.3,
                'twitter': 0.2,
                'youtube': 0.1,
            }
        
        # OpenAI requirements (for summaries)
        openai_rpm = peak_minute_shares  # Each share needs a summary
        openai_tpm = openai_rpm * usage.average_tokens_per_request
        
        results['openai'] = {
            'service': 'OpenAI GPT',
            'daily_requests': total_daily_shares,
            'peak_rpm': openai_rpm,
            'peak_tpm': openai_tpm,
            'recommended_tier': self._find_best_tier('openai', openai_rpm, openai_tpm),
            'monthly_cost_estimate': self._estimate_monthly_cost(
                'openai', total_daily_shares * 30, openai_tpm * 60 * 24 * 30
            ),
        }
        
        # Whisper requirements (for videos - assume 60% are videos)
        video_percentage = 0.6
        whisper_daily = total_daily_shares * video_percentage
        whisper_rpm = peak_minute_shares * video_percentage
        
        results['whisper'] = {
            'service': 'Whisper Transcription',
            'daily_requests': whisper_daily,
            'peak_rpm': whisper_rpm,
            'peak_concurrent': whisper_rpm / 2,  # Assume 30s average processing
            'recommended_tier': self._find_best_tier('whisper', whisper_rpm, None),
            'monthly_cost_estimate': self._estimate_monthly_cost(
                'whisper', whisper_daily * 30, None
            ),
        }
        
        # Embeddings requirements
        embeddings_daily = total_daily_shares * 2  # Caption + enhanced summary
        embeddings_rpm = peak_minute_shares * 2
        embeddings_tpm = embeddings_rpm * 200  # Smaller token count for embeddings
        
        results['embeddings'] = {
            'service': 'OpenAI Embeddings',
            'daily_requests': embeddings_daily,
            'peak_rpm': embeddings_rpm,
            'peak_tpm': embeddings_tpm,
            'recommended_tier': self._find_best_tier('embeddings', embeddings_rpm, embeddings_tpm),
            'monthly_cost_estimate': self._estimate_monthly_cost(
                'embeddings', embeddings_daily * 30, embeddings_tpm * 60 * 24 * 30
            ),
        }
        
        # Platform-specific calculations
        for platform, percentage in usage.platform_distribution.items():
            platform_daily = total_daily_shares * percentage
            platform_rpm = peak_minute_shares * percentage
            
            results[platform] = {
                'service': f'{platform.capitalize()} API',
                'daily_requests': platform_daily,
                'peak_rpm': platform_rpm,
                'percentage_of_traffic': percentage * 100,
                'rate_limit_info': self._get_platform_limits(platform),
            }
        
        return results
    
    def _find_best_tier(
        self, 
        service: str, 
        required_rpm: float,
        required_tpm: Optional[float]
    ) -> Optional[APITier]:
        """Find the most cost-effective tier that meets requirements"""
        if service not in API_TIERS:
            return None
        
        suitable_tiers = []
        for tier in API_TIERS[service]:
            if tier.requests_per_minute >= required_rpm:
                if required_tpm is None or tier.tokens_per_minute is None:
                    suitable_tiers.append(tier)
                elif tier.tokens_per_minute >= required_tpm:
                    suitable_tiers.append(tier)
        
        if not suitable_tiers:
            return None
        
        # Return cheapest suitable tier
        return min(suitable_tiers, key=lambda t: t.cost_per_month)
    
    def _estimate_monthly_cost(
        self,
        service: str,
        monthly_requests: float,
        monthly_tokens: Optional[float]
    ) -> float:
        """Estimate monthly cost for a service"""
        if service not in API_TIERS:
            return 0.0
        
        # Find the appropriate tier
        rpm = monthly_requests / (30 * 24 * 60)
        tpm = monthly_tokens / (30 * 24 * 60) if monthly_tokens else None
        
        tier = self._find_best_tier(service, rpm, tpm)
        if not tier:
            return 0.0
        
        # Calculate cost
        base_cost = tier.cost_per_month
        
        # Add usage-based costs
        if tier.cost_per_request:
            base_cost += monthly_requests * tier.cost_per_request
        
        if tier.cost_per_token and monthly_tokens:
            base_cost += monthly_tokens * tier.cost_per_token
        
        return base_cost
    
    def _get_platform_limits(self, platform: str) -> Dict[str, any]:
        """Get known rate limits for platforms"""
        limits = {
            'tiktok': {
                'estimated_rpm': 100,
                'documentation': 'No official docs - conservative estimate',
                'requires_auth': True,
            },
            'reddit': {
                'rpm': 60,
                'daily_quota': None,
                'documentation': 'OAuth apps: 60 requests/minute',
                'requires_auth': True,
            },
            'twitter': {
                'rpm_range': '300-500',
                'window': '15 minutes',
                'documentation': 'Varies by tier and endpoint',
                'requires_auth': True,
            },
            'youtube': {
                'daily_quota': 10000,
                'cost_per_request': '1-50 units',
                'documentation': 'Quota-based system',
                'requires_auth': True,
            },
        }
        
        return limits.get(platform, {'error': 'Unknown platform'})
    
    def generate_report(self, usage: UsagePattern, results: Dict[str, Dict]) -> None:
        """Generate a comprehensive capacity planning report"""
        console.print(Panel.fit(
            "[bold cyan]Capacity Planning Report[/bold cyan]",
            border_style="cyan"
        ))
        
        # Usage summary
        console.print("\n[bold]Usage Pattern Summary:[/bold]")
        console.print(f"  Total Users: {usage.users:,}")
        console.print(f"  Shares per User per Day: {usage.shares_per_user_per_day}")
        console.print(f"  Premium Users: {usage.premium_user_percentage:.1%}")
        console.print(f"  Peak Hour Multiplier: {usage.peak_hour_multiplier}x")
        
        total_daily = usage.users * usage.shares_per_user_per_day
        console.print(f"\n  [cyan]Total Daily Shares: {total_daily:,.0f}[/cyan]")
        console.print(f"  [cyan]Peak Hour Shares: {total_daily * 0.2 * usage.peak_hour_multiplier:,.0f}[/cyan]")
        console.print(f"  [cyan]Peak Minute Shares: {total_daily * 0.2 * usage.peak_hour_multiplier / 60:,.0f}[/cyan]")
        
        # ML Services requirements
        console.print("\n[bold]ML Service Requirements:[/bold]")
        
        ml_table = Table(show_header=True, header_style="bold magenta")
        ml_table.add_column("Service", style="dim")
        ml_table.add_column("Daily Requests", justify="right")
        ml_table.add_column("Peak RPM", justify="right")
        ml_table.add_column("Recommended Tier", justify="center")
        ml_table.add_column("Monthly Cost", justify="right", style="green")
        
        total_ml_cost = 0
        for service in ['openai', 'whisper', 'embeddings']:
            if service in results:
                r = results[service]
                tier = r.get('recommended_tier')
                tier_name = tier.name if tier else "NONE SUITABLE"
                monthly_cost = r.get('monthly_cost_estimate', 0)
                total_ml_cost += monthly_cost
                
                ml_table.add_row(
                    r['service'],
                    f"{r['daily_requests']:,.0f}",
                    f"{r['peak_rpm']:,.0f}",
                    tier_name,
                    f"${monthly_cost:,.2f}"
                )
        
        ml_table.add_row(
            "[bold]TOTAL[/bold]",
            "",
            "",
            "",
            f"[bold]${total_ml_cost:,.2f}[/bold]"
        )
        
        console.print(ml_table)
        
        # Platform distribution
        console.print("\n[bold]Platform Distribution:[/bold]")
        
        platform_table = Table(show_header=True, header_style="bold magenta")
        platform_table.add_column("Platform", style="dim")
        platform_table.add_column("% of Traffic", justify="right")
        platform_table.add_column("Daily Requests", justify="right")
        platform_table.add_column("Peak RPM", justify="right")
        platform_table.add_column("Known Limit", justify="right")
        platform_table.add_column("Status", justify="center")
        
        for platform in ['tiktok', 'reddit', 'twitter', 'youtube']:
            if platform in results:
                r = results[platform]
                limits = r.get('rate_limit_info', {})
                
                # Determine if we're within limits
                peak_rpm = r['peak_rpm']
                if 'rpm' in limits:
                    limit_rpm = limits['rpm']
                    status = "[green]OK[/green]" if peak_rpm < limit_rpm else "[red]EXCEEDS[/red]"
                elif 'estimated_rpm' in limits:
                    limit_rpm = limits['estimated_rpm']
                    status = "[yellow]CHECK[/yellow]" if peak_rpm < limit_rpm else "[red]RISKY[/red]"
                else:
                    limit_rpm = "Unknown"
                    status = "[yellow]???[/yellow]"
                
                platform_table.add_row(
                    platform.capitalize(),
                    f"{r.get('percentage_of_traffic', 0):.0f}%",
                    f"{r['daily_requests']:,.0f}",
                    f"{r['peak_rpm']:,.0f}",
                    str(limit_rpm),
                    status
                )
        
        console.print(platform_table)
        
        # Recommendations
        console.print("\n[bold]Recommendations:[/bold]")
        
        recommendations = []
        
        # Check if any platform exceeds limits
        for platform in ['tiktok', 'reddit', 'twitter', 'youtube']:
            if platform in results:
                r = results[platform]
                limits = r.get('rate_limit_info', {})
                peak_rpm = r['peak_rpm']
                
                if 'rpm' in limits and peak_rpm > limits['rpm']:
                    recommendations.append(
                        f"[red]• {platform.capitalize()} will exceed rate limits. "
                        f"Implement queuing and spreading.[/red]"
                    )
                elif 'estimated_rpm' in limits and peak_rpm > limits['estimated_rpm'] * 0.8:
                    recommendations.append(
                        f"[yellow]• {platform.capitalize()} approaching estimated limits. "
                        f"Monitor closely.[/yellow]"
                    )
        
        # Cost optimization
        if total_ml_cost > 1000:
            recommendations.append(
                f"[yellow]• High ML costs (${total_ml_cost:,.2f}/month). "
                f"Consider caching and batch processing.[/yellow]"
            )
        
        # Queue recommendations
        if total_daily > 10000:
            recommendations.append(
                "[cyan]• High volume detected. Priority queue system is essential.[/cyan]"
            )
        
        if not recommendations:
            recommendations.append("[green]• Current configuration should handle expected load.[/green]")
        
        for rec in recommendations:
            console.print(rec)
        
        # Infrastructure recommendations
        console.print("\n[bold]Infrastructure Requirements:[/bold]")
        
        # Queue depth estimation
        avg_processing_time = 5  # seconds
        concurrent_processing = 10  # workers
        max_queue_depth = (total_daily * 0.2 * usage.peak_hour_multiplier / 3600) * avg_processing_time * concurrent_processing
        
        console.print(f"  • Estimated Max Queue Depth: {max_queue_depth:,.0f} jobs")
        console.print(f"  • Recommended Redis Memory: {max(1, max_queue_depth * 1024 / 1e9):.1f} GB")
        console.print(f"  • Recommended Workers: {max(5, peak_minute_shares / 10):.0f}")

def main():
    parser = argparse.ArgumentParser(description='Capacity Planning Calculator')
    parser.add_argument('--users', type=int, required=True, help='Number of users')
    parser.add_argument('--shares-per-day', type=float, default=5, 
                       help='Average shares per user per day')
    parser.add_argument('--premium-percent', type=float, default=10,
                       help='Percentage of premium users')
    parser.add_argument('--peak-multiplier', type=float, default=3,
                       help='Peak hour traffic multiplier')
    parser.add_argument('--avg-tokens', type=int, default=500,
                       help='Average tokens per request')
    parser.add_argument('--output', help='Output file for JSON results')
    
    args = parser.parse_args()
    
    # Create usage pattern
    usage = UsagePattern(
        users=args.users,
        shares_per_user_per_day=args.shares_per_day,
        premium_user_percentage=args.premium_percent / 100,
        peak_hour_multiplier=args.peak_multiplier,
        average_tokens_per_request=args.avg_tokens,
    )
    
    # Calculate requirements
    calculator = CapacityCalculator()
    results = calculator.calculate_requirements(usage)
    
    # Generate report
    calculator.generate_report(usage, results)
    
    # Save JSON if requested
    if args.output:
        with open(args.output, 'w') as f:
            json.dump({
                'usage_pattern': {
                    'users': usage.users,
                    'shares_per_user_per_day': usage.shares_per_user_per_day,
                    'premium_user_percentage': usage.premium_user_percentage,
                    'peak_hour_multiplier': usage.peak_hour_multiplier,
                },
                'results': results,
            }, f, indent=2, default=str)
        console.print(f"\n[green]Results saved to {args.output}[/green]")

if __name__ == "__main__":
    main()