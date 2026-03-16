resource "random_password" "kafka_manager" {
  length           = 24
  special          = true
  override_special = "#@!%^*-_+="
}

locals {
  kafka_manager_password = length(trimspace(var.dms_manager_password)) > 0 ? var.dms_manager_password : random_password.kafka_manager.result
}

resource "huaweicloud_dms_kafka_instance" "events" {
  name               = "${local.resource_prefix}-kafka"
  engine_version     = var.dms_kafka_engine_version
  flavor_id          = var.dms_flavor_id
  broker_num         = var.dms_broker_num
  storage_spec_code  = var.dms_storage_spec_code
  storage_space      = var.dms_storage_space
  vpc_id             = huaweicloud_vpc.main.id
  network_id         = huaweicloud_vpc_subnet.this["data"].id
  security_group_id  = huaweicloud_networking_secgroup.platform.id
  availability_zones = local.secondary_azs
  manager_user       = var.dms_manager_user
  manager_password   = local.kafka_manager_password
  retention_policy   = "time_base"
  charging_mode      = "postPaid"
  tags               = local.tags
}

resource "huaweicloud_dms_kafka_topic" "order_events" {
  instance_id = huaweicloud_dms_kafka_instance.events.id
  name        = "${local.resource_prefix}-orders"
  partitions  = var.kafka_topic_partitions
  replicas    = min(var.dms_broker_num, 3)
}
