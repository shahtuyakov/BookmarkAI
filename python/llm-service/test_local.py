#!/usr/bin/env python3
"""
Local testing script for LLM summarization service.
"""
import os
import sys
import uuid
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

from llm_service.tasks import summarize_content


def test_summarization():
    """Test the summarization task locally."""
    
    # Test data
    test_share_id = str(uuid.uuid4())
    test_content = {
        'text': """
        Artificial Intelligence (AI) has become one of the most transformative technologies of the 21st century. 
        From natural language processing to computer vision, AI systems are revolutionizing how we interact with 
        technology and process information. Machine learning algorithms can now recognize patterns in vast datasets, 
        make predictions, and even generate creative content. However, with great power comes great responsibility. 
        As AI becomes more prevalent, we must consider ethical implications, potential biases, and the need for 
        transparent and accountable AI systems. The future of AI lies in creating systems that augment human 
        capabilities while maintaining human values and oversight.
        """,
        'title': "The Rise of Artificial Intelligence",
        'content_type': 'article'
    }
    
    test_options = {
        'provider': 'openai',  # or 'anthropic'
        'style': 'brief',
        'max_length': 150
    }
    
    print(f"Testing summarization for share_id: {test_share_id}")
    print(f"Content length: {len(test_content['text'])} characters")
    print("-" * 50)
    
    try:
        # Run the task synchronously for testing
        result = summarize_content(
            share_id=test_share_id,
            content=test_content,
            options=test_options
        )
        
        print("✅ Summarization successful!")
        print(f"Summary: {result['summary']}")
        print(f"Processing time: {result['processing_ms']}ms")
        
        if result.get('key_points'):
            print("\nKey points:")
            for point in result['key_points']:
                print(f"  • {point}")
                
    except Exception as e:
        print(f"❌ Summarization failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    print("LLM Service Local Test")
    print("=" * 50)
    
    # Check for required environment variables
    required_vars = ['OPENAI_API_KEY', 'DATABASE_URL', 'REDIS_URL']
    missing_vars = [var for var in required_vars if not os.environ.get(var)]
    
    if missing_vars:
        print(f"⚠️  Missing environment variables: {', '.join(missing_vars)}")
        print("Please set them in .env file or environment")
        sys.exit(1)
    
    test_summarization()