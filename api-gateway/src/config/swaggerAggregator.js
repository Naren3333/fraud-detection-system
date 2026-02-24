const axios = require('axios');

const services = [
  { name: 'transaction-service', url: 'http://transaction-service:3001/api-docs.json' },
  { name: 'user-service', url: 'http://user-service:3002/api-docs.json' },
  { name: 'fraud-detection-service', url: 'http://fraud-detection-service:3003/api-docs.json' },
  { name: 'ml-scoring-service', url: 'http://ml-scoring-service:3004/api-docs.json' },
  { name: 'decision-engine-service', url: 'http://decision-engine-service:3005/api-docs.json' },
  { name: 'notification-service', url: 'http://notification-service:3006/api-docs.json' },
  { name: 'audit-service', url: 'http://audit-service:3007/api-docs.json' },
  { name: 'analytics-service', url: 'http://analytics-service:3008/api-docs.json' },
  { name: 'human-verification-service', url: 'http://human-verification-service:3010/api-docs.json' }
];

async function aggregateSwaggerSpecs() {
  const mergedSpec = {
    openapi: '3.0.0',
    info: {
      title: 'Fraud Detection Platform API',
      version: '2.0.0'
    },
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {}
    }
  };

  for (const service of services) {
    try {
      const { data } = await axios.get(service.url, { timeout: 2000 });

      if (data.paths) {
        Object.assign(mergedSpec.paths, data.paths);
      }

      if (data.components?.schemas) {
        Object.assign(mergedSpec.components.schemas, data.components.schemas);
      }

      if (data.components?.securitySchemes) {
        Object.assign(mergedSpec.components.securitySchemes, data.components.securitySchemes);
      }

      console.log(`Loaded Swagger from ${service.name}`);
    } catch (error) {
      console.warn(`Failed to load Swagger from ${service.name}`);
    }
  }

  return mergedSpec;
}

module.exports = aggregateSwaggerSpecs;
