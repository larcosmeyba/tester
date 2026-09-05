variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "database_tier" {
  type    = string
  default = "db-custom-1-3840"
}

variable "database_disk_size_gb" {
  type    = number
  default = 20
}

variable "database_deletion_protection" {
  type    = bool
  default = true
}

variable "auth_cors_allowed_origins" {
  type    = string
  default = "https://example.invalid"
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
