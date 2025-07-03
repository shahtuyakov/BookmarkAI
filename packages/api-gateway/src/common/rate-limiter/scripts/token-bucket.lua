-- Token Bucket Rate Limiter with Cost Support
-- KEYS[1] = tokens key
-- KEYS[2] = last refill key
-- ARGV[1] = current timestamp (milliseconds)
-- ARGV[2] = bucket capacity
-- ARGV[3] = refill rate (tokens per second)
-- ARGV[4] = cost (tokens to consume)
-- ARGV[5] = TTL (seconds)

local tokens_key = KEYS[1]
local last_refill_key = KEYS[2]
local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refill_rate = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

-- Get current tokens and last refill time
local current_tokens = tonumber(redis.call('GET', tokens_key) or capacity)
local last_refill = tonumber(redis.call('GET', last_refill_key) or now)

-- Calculate tokens to add based on time elapsed
local time_elapsed = math.max(0, now - last_refill) / 1000  -- Convert to seconds
local tokens_to_add = time_elapsed * refill_rate

-- Update tokens (capped at capacity)
current_tokens = math.min(capacity, current_tokens + tokens_to_add)

-- Check if we have enough tokens
if current_tokens < cost then
    -- Calculate when we'll have enough tokens
    local tokens_needed = cost - current_tokens
    local seconds_until_tokens = tokens_needed / refill_rate
    local retry_after = math.ceil(seconds_until_tokens)
    local reset_at = now + (retry_after * 1000)
    
    -- Update refill time even on failure
    redis.call('SET', last_refill_key, now, 'EX', ttl)
    redis.call('SET', tokens_key, current_tokens, 'EX', ttl)
    
    -- Return: allowed, remaining, reset_at, retry_after
    return {0, math.floor(current_tokens), reset_at, retry_after}
end

-- Consume tokens
current_tokens = current_tokens - cost

-- Update Redis state
redis.call('SET', tokens_key, current_tokens, 'EX', ttl)
redis.call('SET', last_refill_key, now, 'EX', ttl)

-- Calculate reset time (when bucket will be full)
local tokens_until_full = capacity - current_tokens
local seconds_until_full = tokens_until_full / refill_rate
local reset_at = now + (seconds_until_full * 1000)

-- Return: allowed, remaining, reset_at, retry_after
return {1, math.floor(current_tokens), reset_at, 0}