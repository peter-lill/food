export function isOwnerEmail(email: string) {
  const ownerEmails = (process.env.FOOD_OWNER_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLocaleLowerCase())
    .filter(Boolean);

  return ownerEmails.includes(email.trim().toLocaleLowerCase());
}
