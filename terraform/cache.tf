resource "random_password" "redis" {
  length           = 28
  special          = true
  override_special = "#@!%^*-_+="
}

locals {
  redis_password = length(trimspace(var.dcs_password)) > 0 ? var.dcs_password : random_password.redis.result
}

resource "huaweicloud_dcs_instance" "redis" {
  name               = "${local.resource_prefix}-redis"
  engine             = "Redis"
  engine_version     = var.dcs_engine_version
  capacity           = var.dcs_capacity_gb
  flavor             = var.dcs_flavor
  vpc_id             = huaweicloud_vpc.main.id
  subnet_id          = huaweicloud_vpc_subnet.this["data"].id
  security_group_id  = huaweicloud_networking_secgroup.platform.id
  availability_zones = local.secondary_azs
  password           = local.redis_password
  maintain_begin     = var.dcs_maintain_begin
  maintain_end       = var.dcs_maintain_end
  tags               = local.tags
}
