variable "project_id" {
  type        = string
  description = "Google Cloud project containing this environment."
}

variable "environment" {
  type        = string
  description = "Environment suffix, normally dev or prod."

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod"
  }
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "database_tier" {
  type    = string
  default = "db-f1-micro"
}

variable "database_disk_size_gb" {
  type    = number
  default = 10
}

variable "database_deletion_protection" {
  type    = bool
  default = true
}

variable "bootstrap_image" {
  type    = string
  default = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "auth_cors_allowed_origins" {
  type        = string
  default     = "https://example.invalid"
  description = "Comma-separated browser origins. Native deep-link origins are configured in Better Auth itself."
}

variable "mobile_auth_callback_url" {
  type    = string
  default = "helpthehive://auth"
}

variable "auth_email_from" {
  type    = string
  default = "Help The Hive <auth@example.com>"
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 5
}
