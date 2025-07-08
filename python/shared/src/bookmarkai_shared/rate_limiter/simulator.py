#!/usr/bin/env python3
"""
Rate Limit Simulator
Test rate limit configurations and capacity planning without hitting real APIs
"""
import asyncio
import random
import time
import argparse
import json
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, field
import matplotlib.pyplot as plt
import numpy as np
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn
from redis.asyncio import Redis

from .distributed_rate_limiter import DistributedRateLimiter
from .rate_limit_config import RateLimitConfigLoader

console = Console()

@dataclass
class SimulationConfig:
    """Configuration for rate limit simulation"""
    service: str
    duration_seconds: int = 300  # 5 minutes
    requests_per_second: float = 10.0
    cost_distribution: str = "uniform"  # uniform, normal, exponential
    cost_min: float = 1.0
    cost_max: float = 10.0
    cost_mean: float = 5.0
    cost_stddev: float = 2.0
    user_count: int = 10
    user_distribution: str = "uniform"  # uniform, pareto (80/20 rule)
    failure_injection_rate: float = 0.0  # Simulate API failures
    
@dataclass
class SimulationResult:
    """Results from a simulation run"""
    total_requests: int = 0
    allowed_requests: int = 0
    denied_requests: int = 0
    total_cost: float = 0.0
    allowed_cost: float = 0.0
    denied_cost: float = 0.0
    retry_after_times: List[int] = field(default_factory=list)
    latencies: List[float] = field(default_factory=list)
    timeline: List[Tuple[float, bool, float]] = field(default_factory=list)  # (timestamp, allowed, cost)
    user_stats: Dict[str, Dict] = field(default_factory=dict)
    
    @property
    def success_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return self.allowed_requests / self.total_requests
    
    @property
    def average_latency(self) -> float:
        if not self.latencies:
            return 0.0
        return sum(self.latencies) / len(self.latencies)
    
    @property
    def p95_latency(self) -> float:
        if not self.latencies:
            return 0.0
        return np.percentile(self.latencies, 95)

class RateLimitSimulator:
    """Simulates rate limiting behavior for capacity planning"""
    
    def __init__(self, redis_client: Optional[Redis] = None):
        self.redis = redis_client
        self.rate_limiter = None
        if redis_client:
            config_loader = RateLimitConfigLoader()
            self.rate_limiter = DistributedRateLimiter(redis_client, config_loader)
    
    def generate_cost(self, config: SimulationConfig) -> float:
        """Generate a cost value based on distribution"""
        if config.cost_distribution == "uniform":
            return random.uniform(config.cost_min, config.cost_max)
        elif config.cost_distribution == "normal":
            cost = random.gauss(config.cost_mean, config.cost_stddev)
            return max(config.cost_min, min(config.cost_max, cost))
        elif config.cost_distribution == "exponential":
            cost = random.expovariate(1 / config.cost_mean)
            return max(config.cost_min, min(config.cost_max, cost))
        else:
            return config.cost_mean
    
    def select_user(self, config: SimulationConfig) -> str:
        """Select a user based on distribution"""
        if config.user_distribution == "uniform":
            return f"user_{random.randint(1, config.user_count)}"
        elif config.user_distribution == "pareto":
            # 80/20 rule: 20% of users generate 80% of traffic
            if random.random() < 0.8:
                # 80% of requests from top 20% of users
                return f"user_{random.randint(1, max(1, config.user_count // 5))}"
            else:
                # 20% of requests from other 80% of users
                return f"user_{random.randint(max(1, config.user_count // 5) + 1, config.user_count)}"
        else:
            return "user_1"
    
    async def simulate_request(
        self,
        config: SimulationConfig,
        user_id: str,
        cost: float,
        inject_failure: bool = False
    ) -> Tuple[bool, Optional[int], float]:
        """Simulate a single request"""
        start_time = time.time()
        
        if self.rate_limiter and not inject_failure:
            try:
                result = await self.rate_limiter.check_limit(
                    service=config.service,
                    identifier=user_id,
                    cost=cost
                )
                latency = (time.time() - start_time) * 1000
                return result.allowed, result.retry_after if not result.allowed else None, latency
            except Exception as e:
                console.print(f"[red]Error in rate limiter: {e}[/red]")
                return False, None, 0.0
        else:
            # Simulate without actual rate limiter
            # Simple token bucket simulation
            allowed = random.random() > 0.1  # 90% success rate
            retry_after = random.randint(1000, 5000) if not allowed else None
            latency = random.uniform(1, 10)  # 1-10ms
            return allowed, retry_after, latency
    
    async def run_simulation(
        self,
        config: SimulationConfig,
        progress: Optional[Progress] = None
    ) -> SimulationResult:
        """Run a complete simulation"""
        result = SimulationResult()
        
        # Calculate request interval
        interval = 1.0 / config.requests_per_second
        
        # Simulation timeline
        start_time = time.time()
        end_time = start_time + config.duration_seconds
        
        task_id = None
        if progress:
            task_id = progress.add_task(
                "[cyan]Simulating requests...",
                total=int(config.duration_seconds * config.requests_per_second)
            )
        
        request_count = 0
        while time.time() < end_time:
            # Generate request parameters
            user_id = self.select_user(config)
            cost = self.generate_cost(config)
            inject_failure = random.random() < config.failure_injection_rate
            
            # Simulate request
            allowed, retry_after, latency = await self.simulate_request(
                config, user_id, cost, inject_failure
            )
            
            # Record results
            result.total_requests += 1
            result.total_cost += cost
            
            if allowed:
                result.allowed_requests += 1
                result.allowed_cost += cost
            else:
                result.denied_requests += 1
                result.denied_cost += cost
                if retry_after:
                    result.retry_after_times.append(retry_after)
            
            result.latencies.append(latency)
            result.timeline.append((time.time() - start_time, allowed, cost))
            
            # Update user stats
            if user_id not in result.user_stats:
                result.user_stats[user_id] = {
                    'total': 0, 'allowed': 0, 'denied': 0,
                    'total_cost': 0.0, 'allowed_cost': 0.0
                }
            
            user_stat = result.user_stats[user_id]
            user_stat['total'] += 1
            user_stat['total_cost'] += cost
            if allowed:
                user_stat['allowed'] += 1
                user_stat['allowed_cost'] += cost
            else:
                user_stat['denied'] += 1
            
            # Update progress
            if progress and task_id is not None:
                progress.update(task_id, advance=1)
            
            # Wait for next request
            request_count += 1
            await asyncio.sleep(interval)
        
        return result
    
    def generate_report(self, config: SimulationConfig, result: SimulationResult) -> None:
        """Generate a detailed report of simulation results"""
        console.print("\n[bold cyan]Rate Limit Simulation Report[/bold cyan]")
        console.print("=" * 60)
        
        # Configuration summary
        console.print(f"\n[bold]Configuration:[/bold]")
        console.print(f"  Service: {config.service}")
        console.print(f"  Duration: {config.duration_seconds}s")
        console.print(f"  Request Rate: {config.requests_per_second} req/s")
        console.print(f"  Users: {config.user_count} ({config.user_distribution} distribution)")
        console.print(f"  Cost: {config.cost_distribution} ({config.cost_min}-{config.cost_max})")
        
        # Overall results
        console.print(f"\n[bold]Overall Results:[/bold]")
        console.print(f"  Total Requests: {result.total_requests}")
        console.print(f"  Allowed: {result.allowed_requests} ({result.success_rate:.1%})")
        console.print(f"  Denied: {result.denied_requests}")
        console.print(f"  Total Cost: {result.total_cost:.1f}")
        console.print(f"  Allowed Cost: {result.allowed_cost:.1f}")
        console.print(f"  Average Latency: {result.average_latency:.2f}ms")
        console.print(f"  P95 Latency: {result.p95_latency:.2f}ms")
        
        # User statistics table
        if result.user_stats:
            console.print(f"\n[bold]Top Users by Request Volume:[/bold]")
            table = Table(show_header=True, header_style="bold magenta")
            table.add_column("User", style="dim")
            table.add_column("Total", justify="right")
            table.add_column("Allowed", justify="right")
            table.add_column("Success Rate", justify="right")
            table.add_column("Total Cost", justify="right")
            
            # Sort users by total requests
            sorted_users = sorted(
                result.user_stats.items(),
                key=lambda x: x[1]['total'],
                reverse=True
            )[:10]  # Top 10
            
            for user_id, stats in sorted_users:
                success_rate = stats['allowed'] / stats['total'] if stats['total'] > 0 else 0
                table.add_row(
                    user_id,
                    str(stats['total']),
                    str(stats['allowed']),
                    f"{success_rate:.1%}",
                    f"{stats['total_cost']:.1f}"
                )
            
            console.print(table)
        
        # Retry after distribution
        if result.retry_after_times:
            console.print(f"\n[bold]Retry After Distribution:[/bold]")
            console.print(f"  Min: {min(result.retry_after_times)}ms")
            console.print(f"  Max: {max(result.retry_after_times)}ms")
            console.print(f"  Average: {sum(result.retry_after_times) / len(result.retry_after_times):.0f}ms")
    
    def plot_results(self, config: SimulationConfig, result: SimulationResult) -> None:
        """Generate plots for visualization"""
        fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(12, 10))
        
        # Timeline plot
        timestamps, allowed_list, costs = zip(*result.timeline)
        allowed_timestamps = [t for t, a, _ in result.timeline if a]
        denied_timestamps = [t for t, a, _ in result.timeline if not a]
        
        ax1.scatter(allowed_timestamps, [1] * len(allowed_timestamps), 
                   c='green', s=1, alpha=0.5, label='Allowed')
        ax1.scatter(denied_timestamps, [0] * len(denied_timestamps), 
                   c='red', s=1, alpha=0.5, label='Denied')
        ax1.set_xlabel('Time (s)')
        ax1.set_ylabel('Request Status')
        ax1.set_title('Request Timeline')
        ax1.legend()
        ax1.grid(True, alpha=0.3)
        
        # Success rate over time (sliding window)
        window_size = max(1, len(result.timeline) // 50)
        success_rates = []
        time_points = []
        
        for i in range(window_size, len(result.timeline)):
            window = result.timeline[i-window_size:i]
            success_count = sum(1 for _, allowed, _ in window if allowed)
            success_rates.append(success_count / window_size)
            time_points.append(window[-1][0])
        
        ax2.plot(time_points, success_rates, 'b-', linewidth=2)
        ax2.set_xlabel('Time (s)')
        ax2.set_ylabel('Success Rate')
        ax2.set_title('Success Rate Over Time')
        ax2.grid(True, alpha=0.3)
        ax2.set_ylim(0, 1.1)
        
        # Latency distribution
        ax3.hist(result.latencies, bins=50, alpha=0.7, color='purple', edgecolor='black')
        ax3.axvline(result.average_latency, color='red', linestyle='--', 
                   linewidth=2, label=f'Avg: {result.average_latency:.1f}ms')
        ax3.axvline(result.p95_latency, color='orange', linestyle='--', 
                   linewidth=2, label=f'P95: {result.p95_latency:.1f}ms')
        ax3.set_xlabel('Latency (ms)')
        ax3.set_ylabel('Count')
        ax3.set_title('Latency Distribution')
        ax3.legend()
        ax3.grid(True, alpha=0.3)
        
        # User distribution
        user_requests = [(u, s['total']) for u, s in result.user_stats.items()]
        user_requests.sort(key=lambda x: x[1], reverse=True)
        top_users = user_requests[:20]  # Top 20 users
        
        if top_users:
            users, counts = zip(*top_users)
            ax4.bar(range(len(users)), counts, color='teal')
            ax4.set_xlabel('User Rank')
            ax4.set_ylabel('Request Count')
            ax4.set_title('Request Distribution by User (Top 20)')
            ax4.grid(True, alpha=0.3, axis='y')
        
        plt.tight_layout()
        plt.savefig(f'rate_limit_simulation_{config.service}_{int(time.time())}.png')
        console.print(f"\n[green]Plots saved to rate_limit_simulation_{config.service}_{int(time.time())}.png[/green]")

async def main():
    parser = argparse.ArgumentParser(description='Rate Limit Simulator')
    parser.add_argument('--service', required=True, help='Service name (e.g., openai, reddit)')
    parser.add_argument('--rps', type=float, default=10, help='Requests per second')
    parser.add_argument('--duration', type=int, default=300, help='Simulation duration in seconds')
    parser.add_argument('--users', type=int, default=10, help='Number of users')
    parser.add_argument('--cost-min', type=float, default=1, help='Minimum cost per request')
    parser.add_argument('--cost-max', type=float, default=10, help='Maximum cost per request')
    parser.add_argument('--cost-dist', choices=['uniform', 'normal', 'exponential'], 
                       default='uniform', help='Cost distribution')
    parser.add_argument('--user-dist', choices=['uniform', 'pareto'], 
                       default='uniform', help='User distribution')
    parser.add_argument('--failure-rate', type=float, default=0.0, 
                       help='Failure injection rate (0-1)')
    parser.add_argument('--redis-host', default='localhost', help='Redis host')
    parser.add_argument('--redis-port', type=int, default=6379, help='Redis port')
    parser.add_argument('--no-redis', action='store_true', help='Run without Redis')
    parser.add_argument('--plot', action='store_true', help='Generate plots')
    
    args = parser.parse_args()
    
    # Create simulation config
    config = SimulationConfig(
        service=args.service,
        duration_seconds=args.duration,
        requests_per_second=args.rps,
        user_count=args.users,
        cost_min=args.cost_min,
        cost_max=args.cost_max,
        cost_distribution=args.cost_dist,
        user_distribution=args.user_dist,
        failure_injection_rate=args.failure_rate,
    )
    
    # Initialize simulator
    redis_client = None
    if not args.no_redis:
        try:
            redis_client = Redis(host=args.redis_host, port=args.redis_port)
            await redis_client.ping()
            console.print("[green]Connected to Redis[/green]")
        except Exception as e:
            console.print(f"[yellow]Warning: Could not connect to Redis: {e}[/yellow]")
            console.print("[yellow]Running in simulation mode without actual rate limiter[/yellow]")
            redis_client = None
    
    simulator = RateLimitSimulator(redis_client)
    
    # Run simulation with progress
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        result = await simulator.run_simulation(config, progress)
    
    # Generate report
    simulator.generate_report(config, result)
    
    # Generate plots if requested
    if args.plot:
        try:
            simulator.plot_results(config, result)
        except ImportError:
            console.print("[yellow]Warning: matplotlib not installed. Skipping plots.[/yellow]")
    
    # Cleanup
    if redis_client:
        await redis_client.close()

if __name__ == "__main__":
    asyncio.run(main())