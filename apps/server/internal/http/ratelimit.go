package serverhttp

import (
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// ipRateLimiter is a simple per-IP token-bucket rate limiter. It needs no
// external dependencies and is deliberately small: buckets refill at
// perMinute tokens per minute and burst up to perMinute tokens.
type ipRateLimiter struct {
	mu        sync.Mutex
	buckets   map[string]*tokenBucket
	perMinute float64
	ttl       time.Duration
}

type tokenBucket struct {
	tokens float64
	last   time.Time
}

// newIPRateLimiter returns a limiter allowing perMinute requests per client
// IP, or nil (disabled) when perMinute <= 0.
func newIPRateLimiter(perMinute int) *ipRateLimiter {
	if perMinute <= 0 {
		return nil
	}
	return &ipRateLimiter{
		buckets:   make(map[string]*tokenBucket),
		perMinute: float64(perMinute),
		ttl:       3 * time.Minute,
	}
}

// allow reports whether a request from ip may proceed, and how many seconds
// the client should wait before retrying when it may not.
func (l *ipRateLimiter) allow(ip string) (ok bool, retryAfterSecs int) {
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	b, found := l.buckets[ip]
	if !found {
		b = &tokenBucket{tokens: l.perMinute, last: now}
		l.buckets[ip] = b
		l.sweepLocked(now)
	}

	elapsed := now.Sub(b.last).Seconds()
	b.tokens += elapsed * l.perMinute / 60
	if b.tokens > l.perMinute {
		b.tokens = l.perMinute
	}
	b.last = now

	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	deficit := 1 - b.tokens
	return false, int(deficit*60/l.perMinute) + 1
}

// sweepLocked drops buckets that have been idle longer than the TTL so the
// map cannot grow without bound. Callers must hold l.mu.
func (l *ipRateLimiter) sweepLocked(now time.Time) {
	for ip, b := range l.buckets {
		if now.Sub(b.last) > l.ttl {
			delete(l.buckets, ip)
		}
	}
}

// middleware returns a chi-compatible middleware that rejects requests over
// the limit with 429 and a Retry-After header.
func (l *ipRateLimiter) middleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ok, retryAfter := l.allow(clientIP(r))
			if !ok {
				w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// clientIP returns the client IP for r. middleware.RealIP runs earlier in the
// chain, so RemoteAddr already holds the (possibly X-Forwarded-For-derived)
// client address.
func clientIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}
