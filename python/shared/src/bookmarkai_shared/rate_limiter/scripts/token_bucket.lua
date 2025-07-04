-- Token bucket rate limiter
-- Keys: [1] = tokens key, [2] = last refill key
-- Args: [1] = current timestamp (ms), [2] = capacity, [3] = refill rate (per second), 
--       [4] = requested tokens (cost), [5] = ttl (seconds)

local tokens_key = KEYS[1]
local last_refill_key = KEYS[2]
local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refill_rate = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

-- Get current state
local current_tokens = tonumber(redis.call('GET', tokens_key) or capacity)
local last_refill = tonumber(redis.call('GET', last_refill_key) or now)

-- Calculate tokens to add based on time passed
local time_passed = math.max(0, now - last_refill) / 1000  -- Convert to seconds
local tokens_to_add = time_passed * refill_rate

-- Update tokens (capped at capacity)
current_tokens = math.min(capacity, current_tokens + tokens_to_add)

-- Check if we have enough tokens
if current_tokens < requested then
  -- Calculate when we'll have enough tokens
  local tokens_needed = requested - current_tokens
  local seconds_until_refill = tokens_needed / refill_rate
  
  return {
    0,  -- allowed: false
    math.floor(current_tokens),  -- available tokens
    capacity,  -- capacity
    math.ceil(seconds_until_refill)  -- retry after (seconds)
  }
end

-- Consume tokens
current_tokens = current_tokens - requested

-- Update state
redis.call('SET', tokens_key, current_tokens, 'EX', ttl)
redis.call('SET', last_refill_key, now, 'EX', ttl)

-- Return success
return {
  1,  -- allowed: true
  math.floor(current_tokens),  -- remaining tokens
  capacity,  -- capacity
  0  -- retry after
}