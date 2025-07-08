-- Sliding Window Rate Limiter
-- KEYS[1] = rate limit key
-- ARGV[1] = current timestamp (milliseconds)
-- ARGV[2] = window size (seconds)
-- ARGV[3] = limit (max requests)
-- ARGV[4] = identifier (unique request ID)
-- ARGV[5] = cost (default 1)

local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local identifier = ARGV[4]
local cost = tonumber(ARGV[5] or 1)

-- Convert window to milliseconds
local window_ms = window * 1000

-- Remove expired entries
redis.call('ZREMRANGEBYSCORE', key, 0, now - window_ms)

-- Count current entries
local current_count = redis.call('ZCARD', key)

-- Check if limit would be exceeded
if current_count + cost > limit then
    -- Get oldest entry to calculate reset time
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local reset_at = oldest[2] and (tonumber(oldest[2]) + window_ms) or (now + window_ms)
    local retry_after = math.ceil((reset_at - now) / 1000)
    
    -- Return: allowed, remaining, reset_at, retry_after
    return {0, 0, reset_at, retry_after}
end

-- Add new entry
-- Add entries based on cost (one entry per unit of cost)
for i = 1, cost do
  redis.call('ZADD', key, now, identifier .. ':' .. now .. ':' .. i)
end
redis.call('EXPIRE', key, window + 1)

-- Calculate remaining
local remaining = limit - current_count - cost

-- Return: allowed, remaining, reset_at, retry_after
return {1, remaining, now + window_ms, 0}