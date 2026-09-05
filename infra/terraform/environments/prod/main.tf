provider "google" {
  project = var.project_id
  region  = var.region
}

module "environment" {
  source = "../../modules/environment"

  project_id                   = var.project_id
  environment                  = "prod"
  region                       = var.region
  database_tier                = var.database_tier
  database_disk_size_gb        = var.database_disk_size_gb
  database_deletion_protection = var.database_deletion_protection
  auth_cors_allowed_origins    = var.auth_cors_allowed_origins
  mobile_auth_callback_url     = var.mobile_auth_callback_url
  auth_email_from              = var.auth_email_from
  min_instances                = var.min_instances
  max_instances                = var.max_instances
}

output "deployment" {
  value = {
    auth_url                = module.environment.auth_service_url
    api_url                 = module.environment.api_service_url
    cloud_sql_connection    = module.environment.cloud_sql_connection_name
    artifact_repository     = module.environment.artifact_repository
    external_secrets_to_add = module.environment.external_secrets_to_seed
    cloud_build_identity    = module.environment.cloud_build_service_account
  }
}
