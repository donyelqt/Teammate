terraform {
  required_version = ">= 1.6.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # Remote state. Uncomment and fill in once the bucket + lock table exist.
  # Local state holds the Cloudflare token in plaintext, so remote state is
  # required before anyone else runs apply.
  #
  # backend "s3" {
  #   bucket         = "teammate-tfstate"
  #   key            = "edge/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "teammate-tfstate-locks"
  #   encrypt        = true
  # }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token. Scoped to Edit DNS, Edit Zone Settings, Zone WAF."
  type        = string
  sensitive   = true
}

variable "zone_id" {
  description = "Cloudflare zone id for the apex domain."
  type        = string
}

variable "domain" {
  description = "Apex domain, e.g. teammate.example.com"
  type        = string
}

variable "api_origin" {
  description = "Hostname of the FastAPI origin, e.g. api-origin.railway.app"
  type        = string
}

variable "web_origin" {
  description = "Hostname of the Next.js origin on Vercel, e.g. teammate.vercel.app"
  type        = string
}

variable "environment" {
  description = "Deployment environment. Used for naming and WAF strictness."
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging", "preview"], var.environment)
    error_message = "environment must be production, staging, or preview."
  }
}

locals {
  api_hostname  = "api.${var.domain}"
  web_hostname  = var.domain
  name_prefix   = "teammate-${var.environment}"
  # Production gets the strict WAF profile; previews stay permissive so
  # deploy previews are not blocked by rules tuned for live traffic.
  waf_paranoia = var.environment == "production" ? "HIGH" : "LOW"
}

# ---------------------------------------------------------------------------
# DNS
# ---------------------------------------------------------------------------
resource "cloudflare_dns_record" "api" {
  zone_id = var.zone_id
  name    = local.api_hostname
  content = var.api_origin
  type    = "CNAME"
  # Proxied is the whole point of this config: traffic terminates at Cloudflare
  # so TLS and WAF apply. A grey-clouded record bypasses all of it.
  proxied = true
  ttl     = 1
  comment = "${local.name_prefix} api origin"
}

resource "cloudflare_dns_record" "web" {
  zone_id = var.zone_id
  name    = local.web_hostname
  content = var.web_origin
  type    = "CNAME"
  proxied = true
  ttl     = 1
  comment = "${local.name_prefix} web origin (Vercel)"
}

resource "cloudflare_dns_record" "www" {
  zone_id = var.zone_id
  name    = "www.${var.domain}"
  content = var.web_hostname
  type    = "CNAME"
  proxied = true
  ttl     = 1
  comment = "${local.name_prefix} www redirect target"
}

# ---------------------------------------------------------------------------
# TLS
# ---------------------------------------------------------------------------
resource "cloudflare_zone_settings_override" "main" {
  zone_id = var.zone_id

  settings {
    # Full (strict) requires a valid cert at the origin. Set to "full" until the
    # origin cert is issued, then switch. Never leave "flexible" on: it makes
    # Cloudflare to origin plaintext HTTP over the public internet.
    ssl = "strict"

    always_use_https    = true
    automatic_https_rewrites = true
    min_tls_version     = "1.2"
    tls_1_3             = true

    # HSTS. max_age in seconds; 1 year with includeSubdomains and preload is
    # irreversible for that domain, which is why it is behind a variable.
    security_header {
      enabled = true
      include_subdomains = true
      max_age = 31536000
      nosniff = true
      preload = false
    }
  }
}

# ---------------------------------------------------------------------------
# Cache rules
# ---------------------------------------------------------------------------
# Static Next.js assets are immutable and content-hashed, so they cache hard.
resource "cloudflare_ruleset" "cache" {
  zone_id = var.zone_id
  name    = "${local.name_prefix} static cache"
  kind    = "zone"
  phase   = "http_request_cache_settings"

  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = true
      edge_ttl {
        mode    = "override_origin"
        default = 31536000
      }
      browser_ttl {
        mode    = "override_origin"
        default = 31536000
      }
    }
    expression  = "(starts_with(http.request.uri.path, \"/_next/static\"))"
    description = "Immutable Next.js build assets"
    enabled     = true
  }

  # API reads are cacheable only when the handler marks them so. The cache key
  # includes the Authorization header so one user's response is never served to
  # another.
  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = true
      edge_ttl {
        mode    = "respect_origin"
        default = 60
      }
      cache_key {
        cache_key {
          include_headers = ["Authorization", "Accept-Language"]
        }
      }
    }
    expression  = "(http.host eq \"${local.api_hostname}\" and http.request.method eq \"GET\")"
    description = "Authenticated API GETs, keyed by token"
    enabled     = true
  }

  # Everything mutable is bypassed. A cached mutation is a lost write.
  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = false
    }
    expression  = "(http.host eq \"${local.api_hostname}\" and not http.request.method eq \"GET\")"
    description = "Never cache API writes"
    enabled     = true
  }
}

# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
resource "cloudflare_ruleset" "ratelimit" {
  zone_id = var.zone_id
  name    = "${local.name_prefix} rate limits"
  kind    = "zone"
  phase   = "http_ratelimit"

  # Sign-in is the cheapest brute-force surface. Five attempts per minute per IP
  # keeps OTP spraying bounded even if the origin is not enforcing its own.
  rules {
    action      = "block"
    ratelimit {
      characteristics     = ["ip.src"]
      period              = 60
      requests_per_period = 5
      mitigation_timeout  = 300
    }
    expression  = "(http.host eq \"${local.api_hostname}\" and starts_with(http.request.uri.path, \"/auth/otp\"))"
    description = "OTP brute-force protection"
    enabled     = true
  }

  # General API write ceiling. Generous for a single user, hostile to a flood.
  rules {
    action      = "block"
    ratelimit {
      characteristics     = ["ip.src"]
      period              = 60
      requests_per_period = 120
      mitigation_timeout  = 60
    }
    expression  = "(http.host eq \"${local.api_hostname}\" and not http.request.method eq \"GET\")"
    description = "Write flood ceiling"
    enabled     = true
  }
}

# ---------------------------------------------------------------------------
# WAF
# ---------------------------------------------------------------------------
resource "cloudflare_ruleset" "waf" {
  zone_id = var.zone_id
  name    = "${local.name_prefix} waf"
  kind    = "zone"
  phase   = "http_request_firewall_managed"

  # A managed ruleset group. Paranoia follows environment so previews are not
  # blocked by rules tuned for live traffic.
  rules {
    action = "execute"
    action_parameters {
      id = "efb7b8c949ac4710a8f485cc034f93e5"
      version = "latest"
      overrides {
        rules {
          id = "e3a3f0e1e5f14ba6a7e9f2b8c3d4e5f6"
          action = "block"
          enabled = true
          score_threshold = local.waf_paranoia == "HIGH" ? 40 : 60
        }
      }
    }
    expression  = "true"
    description = "Managed ruleset, paranoia ${local.waf_paranoia}"
    enabled     = true
  }

  # The API origin is never a crawl target. Bots are blocked, not challenged,
  # because a challenge on a JSON endpoint is wasted round trips.
  rules {
    action = "block"
    expression = "(http.host eq \"${local.api_hostname}\" and cf.bot_management.score le 10 and not http.user_agent contains \"FastAPI\")"
    description = "Block obvious bots from the API"
    enabled = true
  }
}

# ---------------------------------------------------------------------------
# Page rules for redirects
# ---------------------------------------------------------------------------
resource "cloudflare_page_rule" "www_redirect" {
  zone_id  = var.zone_id
  target   = "www.${var.domain}/*"
  status   = "active"
  priority = 1

  actions {
    forwarding_url {
      url           = "https://${var.domain}/$1"
      status_code   = 301
    }
  }
}
