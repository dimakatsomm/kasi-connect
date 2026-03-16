output "vpc_id" {
  description = "ID of the dedicated KasiConnect VPC."
  value       = huaweicloud_vpc.main.id
}

output "subnet_ids" {
  description = "Map of subnet IDs by tier."
  value       = { for name, subnet in huaweicloud_vpc_subnet.this : name => subnet.id }
}

output "security_group_id" {
  description = "Security group that gates ingress and internal service traffic."
  value       = huaweicloud_networking_secgroup.platform.id
}

output "data_security_group_id" {
  description = "Dedicated security group for the RDS PostgreSQL data plane."
  value       = huaweicloud_networking_secgroup.data.id
}

output "nat_gateway_eip" {
  description = "Public IP of the NAT gateway used for CCE worker egress."
  value       = huaweicloud_vpc_eip.nat.address
}

output "cce_cluster_id" {
  description = "CCE cluster hosting the backend + frontend workloads."
  value       = huaweicloud_cce_cluster.main.id
}

output "cce_node_ids" {
  description = "Worker nodes per index for observability hooks."
  value       = { for idx, node in huaweicloud_cce_node.workers : idx => node.id }
}

output "database_private_endpoints" {
  description = "Private IPs that expose the PostgreSQL instance."
  value       = huaweicloud_rds_instance.postgres.private_ips
}

output "redis_instance_id" {
  description = "Redis (DCS) instance identifier for connection lookups."
  value       = huaweicloud_dcs_instance.redis.id
}

output "kafka_instance_id" {
  description = "Kafka (DMS) instance identifier for provisioning topics or ACLs."
  value       = huaweicloud_dms_kafka_instance.events.id
}

output "kafka_topic" {
  description = "Primary orders topic (named <prefix>-orders) managed via Terraform."
  value       = huaweicloud_dms_kafka_topic.order_events.name
}

output "obs_bucket_name" {
  description = "OBS bucket that stores media uploads and static artifacts."
  value       = huaweicloud_obs_bucket.vendor_assets.bucket
}
