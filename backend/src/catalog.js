// Static promo data. It mirrors the defaults authored in the page, so a slow or failed fetch never shows a
// different number than the one the visitor already sees.
const deepFreeze = (value) => {
  for (const child of Object.values(value)) if (typeof child === 'object') deepFreeze(child);
  return Object.freeze(value);
};

export const APP_INFO = deepFreeze({
  app: { name: 'Skywatch', version: '3.4.1' },
  rating: { average: 4.8, count: 12400 },
  downloads: 386000,
  screens: [
    { id: 'alerts', title: 'Pass alerts' },
    { id: 'compass', title: 'Sky compass' },
    { id: 'launches', title: 'Launch calendar' },
  ],
  links: {
    phone: 'https://lumendrift.example/phone',
    tablet: 'https://lumendrift.example/tablet',
  },
});

export const PLATFORMS = Object.keys(APP_INFO.links);
