export default function extract(html) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g;

  const emails = html.match(emailRegex) || [];
  const phones = html.match(phoneRegex) || [];

  return {
    email: emails[0] || null,
    phone: phones[0] || null
  };
};
