variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "database_tier" {
  type    = string
  default = "db-f1-micro"
}

variable "database_deletion_protection" {
  type    = bool
  default = true
}

variable "auth_cors_allowed_origins" {
  type    = string
  default = "https://dev.example.invalid"
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
  default = 2
}
