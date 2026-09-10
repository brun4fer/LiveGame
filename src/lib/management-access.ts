export function isManagementPasswordEnabled() {
  return process.env.NEXT_PUBLIC_MANAGEMENT_PASSWORD_ENABLED === "true";
}
