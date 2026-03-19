resource "random_password" "db" {
  length           = 20
  special          = true
  override_special = "#@!%^*-_+="
}

locals {
  db_admin_password = length(trimspace(var.rds_password)) > 0 ? var.rds_password : random_password.db.result
}

resource "huaweicloud_networking_secgroup" "data" {
  name        = "${local.resource_prefix}-data-sg"
  description = "Security group for RDS PostgreSQL — allows DB port from the platform SG only"
  tags        = local.tags
}

resource "huaweicloud_networking_secgroup_rule" "rds_from_platform" {
  security_group_id = huaweicloud_networking_secgroup.data.id
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = var.rds_port
  port_range_max    = var.rds_port
  remote_group_id   = huaweicloud_networking_secgroup.platform.id
}

resource "huaweicloud_rds_instance" "postgres" {
  name                = "${local.resource_prefix}-pg"
  flavor              = var.rds_flavor
  availability_zone   = local.secondary_azs
  vpc_id              = huaweicloud_vpc.main.id
  subnet_id           = huaweicloud_vpc_subnet.this["data"].id
  security_group_id   = huaweicloud_networking_secgroup.data.id
  ha_replication_mode = var.rds_ha_mode

  db {
    type     = "PostgreSQL"
    version  = var.rds_engine_version
    password = local.db_admin_password
  }

  volume {
    type = var.rds_volume_type
    size = var.rds_volume_size
  }

  backup_strategy {
    start_time = "02:00-03:00"
    keep_days  = var.rds_backup_keep_days
  }

  tags = local.tags
}
