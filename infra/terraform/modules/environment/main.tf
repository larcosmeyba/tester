locals {
  prefix                  = "helpthehive-${var.environment}"
  auth_database_name      = "helpthehive_auth"
  app_database_name       = "helpthehive_app"
  auth_database_user      = "helpthehive_auth"
  app_database_user       = "helpthehive_app"
  artifact_repository     = "${local.prefix}-containers"
  auth_service_name       = "${local.prefix}-auth"
  api_service_name        = "${local.prefix}-api"
  auth_migration_job_name = "${local.prefix}-auth-migrate"
  api_migration_job_name  = "${local.prefix}-api-migrate"

  services = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "iam.googleapis.com",
    "logging.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
  ])

  external_secret_ids = toset([
    "${local.prefix}-better-auth-secret",
    "${local.prefix}-better-auth-api-key",
    "${local.prefix}-resend-api-key",
    "${local.prefix}-apple-client-id",
    "${local.prefix}-apple-team-id",
    "${local.prefix}-apple-key-id",
    "${local.prefix}-apple-private-key",
    "${local.prefix}-apple-app-bundle-identifier",
    "${local.prefix}-google-client-id",
    "${local.prefix}-google-client-secret",
  ])
}

resource "google_project_service" "required" {
  for_each = local.services

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "containers" {
  project       = var.project_id
  location      = var.region
  repository_id = local.artifact_repository
  format        = "DOCKER"
  description   = "Help The Hive ${var.environment} service images"

  depends_on = [google_project_service.required]
}

resource "random_password" "auth_database" {
  length  = 32
  special = false
}

resource "random_password" "app_database" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "postgres" {
  project          = var.project_id
  name             = "${local.prefix}-postgres"
  region           = var.region
  database_version = "POSTGRES_18"

  settings {
    tier                        = var.database_tier
    edition                     = "ENTERPRISE"
    availability_type           = "ZONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = var.database_disk_size_gb
    disk_autoresize             = true
    deletion_protection_enabled = var.database_deletion_protection

    ip_configuration {
      ipv4_enabled = true
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "08:00"
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 7
      hour         = 9
      update_track = "stable"
    }
  }

  deletion_protection = var.database_deletion_protection
  depends_on          = [google_project_service.required]
}

resource "google_sql_database" "auth" {
  project  = var.project_id
  name     = local.auth_database_name
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_database" "app" {
  project  = var.project_id
  name     = local.app_database_name
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "auth" {
  project  = var.project_id
  name     = local.auth_database_user
  instance = google_sql_database_instance.postgres.name
  password = random_password.auth_database.result
}

resource "google_sql_user" "app" {
  project  = var.project_id
  name     = local.app_database_user
  instance = google_sql_database_instance.postgres.name
  password = random_password.app_database.result
}

resource "google_secret_manager_secret" "auth_database_url" {
  project   = var.project_id
  secret_id = "${local.prefix}-auth-database-url"

  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "auth_database_url" {
  secret      = google_secret_manager_secret.auth_database_url.id
  secret_data = "postgresql://${local.auth_database_user}:${urlencode(random_password.auth_database.result)}@/${local.auth_database_name}?host=${urlencode("/cloudsql/${google_sql_database_instance.postgres.connection_name}")}"

  depends_on = [google_sql_database.auth, google_sql_user.auth]
}

resource "google_secret_manager_secret" "app_database_url" {
  project   = var.project_id
  secret_id = "${local.prefix}-app-database-url"

  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "app_database_url" {
  secret      = google_secret_manager_secret.app_database_url.id
  secret_data = "postgresql://${local.app_database_user}:${urlencode(random_password.app_database.result)}@/${local.app_database_name}?host=${urlencode("/cloudsql/${google_sql_database_instance.postgres.connection_name}")}"

  depends_on = [google_sql_database.app, google_sql_user.app]
}

resource "google_secret_manager_secret" "external" {
  for_each = local.external_secret_ids

  project   = var.project_id
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_service_account" "auth_runtime" {
  project      = var.project_id
  account_id   = "${local.prefix}-auth-run"
  display_name = "Help The Hive ${var.environment} auth runtime"
}

resource "google_service_account" "api_runtime" {
  project      = var.project_id
  account_id   = "${local.prefix}-api-run"
  display_name = "Help The Hive ${var.environment} API runtime"
}

resource "google_service_account" "auth_migration" {
  project      = var.project_id
  account_id   = "${local.prefix}-auth-migrate"
  display_name = "Help The Hive ${var.environment} auth migrations"
}

resource "google_service_account" "api_migration" {
  project      = var.project_id
  account_id   = "${local.prefix}-api-migrate"
  display_name = "Help The Hive ${var.environment} API migrations"
}

resource "google_service_account" "cloud_build" {
  project      = var.project_id
  account_id   = "${local.prefix}-build"
  display_name = "Help The Hive ${var.environment} Cloud Build deployer"
}

resource "google_project_iam_member" "cloudsql_client" {
  for_each = {
    auth_runtime   = google_service_account.auth_runtime.email
    api_runtime    = google_service_account.api_runtime.email
    auth_migration = google_service_account.auth_migration.email
    api_migration  = google_service_account.api_migration.email
  }

  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${each.value}"
}

resource "google_project_iam_member" "build_roles" {
  for_each = toset([
    "roles/artifactregistry.writer",
    "roles/logging.logWriter",
    "roles/run.admin",
    "roles/storage.objectViewer",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cloud_build.email}"
}

resource "google_service_account_iam_member" "build_acts_as" {
  for_each = {
    auth_runtime   = google_service_account.auth_runtime.name
    api_runtime    = google_service_account.api_runtime.name
    auth_migration = google_service_account.auth_migration.name
    api_migration  = google_service_account.api_migration.name
  }

  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cloud_build.email}"
}

locals {
  secret_access = {
    auth_runtime_database                    = [google_secret_manager_secret.auth_database_url.id, google_service_account.auth_runtime.email]
    auth_runtime_secret                      = [google_secret_manager_secret.external["${local.prefix}-better-auth-secret"].id, google_service_account.auth_runtime.email]
    auth_runtime_api_key                     = [google_secret_manager_secret.external["${local.prefix}-better-auth-api-key"].id, google_service_account.auth_runtime.email]
    auth_runtime_resend                      = [google_secret_manager_secret.external["${local.prefix}-resend-api-key"].id, google_service_account.auth_runtime.email]
    auth_runtime_apple_client_id             = [google_secret_manager_secret.external["${local.prefix}-apple-client-id"].id, google_service_account.auth_runtime.email]
    auth_runtime_apple_team_id               = [google_secret_manager_secret.external["${local.prefix}-apple-team-id"].id, google_service_account.auth_runtime.email]
    auth_runtime_apple_key_id                = [google_secret_manager_secret.external["${local.prefix}-apple-key-id"].id, google_service_account.auth_runtime.email]
    auth_runtime_apple_private_key           = [google_secret_manager_secret.external["${local.prefix}-apple-private-key"].id, google_service_account.auth_runtime.email]
    auth_runtime_apple_app_bundle_identifier = [google_secret_manager_secret.external["${local.prefix}-apple-app-bundle-identifier"].id, google_service_account.auth_runtime.email]
    auth_runtime_google_client_id            = [google_secret_manager_secret.external["${local.prefix}-google-client-id"].id, google_service_account.auth_runtime.email]
    auth_runtime_google_client_secret        = [google_secret_manager_secret.external["${local.prefix}-google-client-secret"].id, google_service_account.auth_runtime.email]
    auth_migration_database                  = [google_secret_manager_secret.auth_database_url.id, google_service_account.auth_migration.email]
    api_runtime_database                     = [google_secret_manager_secret.app_database_url.id, google_service_account.api_runtime.email]
    api_migration_database                   = [google_secret_manager_secret.app_database_url.id, google_service_account.api_migration.email]
  }
}

resource "google_secret_manager_secret_iam_member" "access" {
  for_each = local.secret_access

  project   = var.project_id
  secret_id = each.value[0]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value[1]}"
}

resource "google_cloud_run_v2_service" "auth" {
  project  = var.project_id
  name     = local.auth_service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.auth_runtime.email
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }
    containers {
      image = var.bootstrap_image
      ports { container_port = 8080 }
    }
  }

  lifecycle { ignore_changes = [template] }
  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service" "api" {
  project  = var.project_id
  name     = local.api_service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.api_runtime.email
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }
    containers {
      image = var.bootstrap_image
      ports { container_port = 8080 }
    }
  }

  lifecycle { ignore_changes = [template] }
  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_job" "auth_migration" {
  project  = var.project_id
  name     = local.auth_migration_job_name
  location = var.region

  template {
    template {
      service_account = google_service_account.auth_migration.email
      max_retries     = 0
      timeout         = "600s"
      containers { image = var.bootstrap_image }
    }
  }

  lifecycle { ignore_changes = [template] }
  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_job" "api_migration" {
  project  = var.project_id
  name     = local.api_migration_job_name
  location = var.region

  template {
    template {
      service_account = google_service_account.api_migration.email
      max_retries     = 0
      timeout         = "600s"
      containers { image = var.bootstrap_image }
    }
  }

  lifecycle { ignore_changes = [template] }
  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service_iam_member" "auth_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.auth.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "api_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
