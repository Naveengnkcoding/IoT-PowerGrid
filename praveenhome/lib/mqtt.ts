// lib/mqtt.ts
import mqtt, { type MqttClient, type IClientOptions } from 'mqtt';

const HIVEMQ_HOST = 'bfb4089403574511a662765cfa5537be.s1.eu.hivemq.cloud';
const HIVEMQ_USERNAME = 'wavedeccan';
const HIVEMQ_PASSWORD = '11223344';

export function createMqttClient(): MqttClient {
  const options: IClientOptions = {
    username: HIVEMQ_USERNAME,
    password: HIVEMQ_PASSWORD,
    clientId: `triox-web-${Math.random().toString(16).slice(2, 10)}`,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
    clean: true,
    keepalive: 60,
    rejectUnauthorized: false,
    protocolVersion: 5,
    // ✅ Use 'mqtt' protocol with WebSocket URL
    protocol: 'wss',
  };

  // ✅ The correct URL format for HiveMQ Cloud
  const brokerUrl = `wss://${HIVEMQ_HOST}:8884/mqtt`;
  
  console.log(`🔌 Connecting to MQTT broker: ${brokerUrl}`);
  const client = mqtt.connect(brokerUrl, options);
  
  // Add connection debug listeners
  client.on('connect', () => {
    console.log('✅ MQTT client connected successfully');
  });

  client.on('error', (err) => {
    console.error('❌ MQTT client error:', err.message);
  });

  client.on('close', () => {
    console.log('🔌 MQTT client connection closed');
  });

  client.on('reconnect', () => {
    console.log('🔄 MQTT client attempting to reconnect...');
  });

  client.on('offline', () => {
    console.log('📴 MQTT client is offline');
  });

  return client;
}

// Optional: Create a singleton client for better performance
let clientInstance: MqttClient | null = null;

export function getMqttClient(): MqttClient {
  if (!clientInstance) {
    clientInstance = createMqttClient();
  }
  return clientInstance;
}

// Cleanup function
export function cleanupMqttClient(): void {
  if (clientInstance) {
    clientInstance.end(true, () => {
      console.log('🧹 MQTT client cleaned up');
      clientInstance = null;
    });
  }
}