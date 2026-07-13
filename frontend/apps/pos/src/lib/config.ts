export const config = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.pizzalog.net',
  businessName: (import.meta.env.VITE_BUSINESS_NAME as string | undefined) ?? 'Pizzalog',
};
