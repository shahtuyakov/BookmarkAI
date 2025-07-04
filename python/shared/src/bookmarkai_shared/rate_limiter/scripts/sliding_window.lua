-- Sliding window rate limiter using sorted sets
-- Keys: [1] = rate limit key
-- Args: [1] = current timestamp (ms), [2] = window size (s), [3] = limit, [4] = identifier, [5] = cost (default 1)

local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2]) * 1000  -- Convert to ms
local limit = tonumber(ARGV[3])
local identifier = ARGV[4]
local cost = tonumber(ARGV[5] or 1)

-- Remove old entries outside the window
local window_start = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- Count current requests in window
local current = redis.call('ZCARD', key)

-- Check if adding this request would exceed limit
if current + cost > limit then
  -- Get oldest entry to calculate when it will expire
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local reset_at = window_start + window
  if #oldest > 0 then
    reset_at = tonumber(oldest[2]) + window
  end
  
  return {
    0,  -- allowed: false
    current,  -- current count
    limit,  -- limit
    math.ceil((reset_at - now) / 1000)  -- retry after (seconds)
  }
end

-- Add entries based on cost (one entry per unit of cost)
for i = 1, cost do
  redis.call('ZADD', key, now, identifier .. ':' .. now .. ':' .. i)
end

-- Update TTL
redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)

-- Return success
return {
  1,  -- allowed: true
  current + cost,  -- new count
  limit,  -- limit
  0  -- retry after
}