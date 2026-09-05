output "auth_service_url" {
  value = google_cloud_run_v2_service.auth.uri
}

output "api_service_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "cloud_sql_connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "artifact_repository" {
  value = google_artifact_registry_repository.containers.name
}

output "external_secrets_to_seed" {
  value = sort(tolist(local.external_secret_ids))
}

output "cloud_build_service_account" {
  value = google_service_account.cloud_build.email
}
