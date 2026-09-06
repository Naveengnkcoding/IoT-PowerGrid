// app/page.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createMqttClient } from '@/lib/mqtt';
import { 
  Thermometer, 
  Droplets, 
  Clock, 
  Users, 
  Activity, 
  Zap, 
  Wifi, 
  WifiOff,
  Power,
} from 'lucide-react';
import type { MqttClient } from 'mqtt';

// Device templates
const deviceTemplates = [
  'Bulb 1',
  'Bulb 2',
  'Bulb 3',
  'Tube Light 1',
  'Tube Light 2',
  'Fan 1',
  'Fan 2',
  'AC',
  'Outlet',
];

// Shuffle function
const shuffleArray = (arr: string[]) => {
  const copy = [...arr];
  // for (let i = copy.length - 1; i > 0; i--) {
  //   const j = Math.floor(Math.random() * (i + 1));
  //   [copy[i], copy[j]] = [copy[j], copy[i]];
  // }
  return copy;
};

// Device emoji mapper
const getDeviceEmoji = (name: string): string => {
  if (name.includes('Bulb')) return '💡';
  if (name.includes('Tube')) return '🔆';
  if (name.includes('Fan')) return '🌀';
  if (name.includes('AC')) return '❄️';
  if (name.includes('Outlet')) return '🔌';
  return '🔘';
};

// Device type mapper for color
const getDeviceColor = (name: string): string => {
  if (name.includes('Bulb')) return 'from-amber-500 to-yellow-300';
  if (name.includes('Tube')) return 'from-blue-400 to-cyan-300';
  if (name.includes('Fan')) return 'from-emerald-400 to-teal-300';
  if (name.includes('AC')) return 'from-sky-400 to-blue-300';
  if (name.includes('Outlet')) return 'from-purple-400 to-pink-300';
  return 'from-gray-400 to-gray-300';
};

const getShuffledDeviceStates = () =>
  shuffleArray(deviceTemplates).map((name, i) => ({
    id: i + 1,
    name,
    isOn: false,
    emoji: getDeviceEmoji(name),
    color: getDeviceColor(name),
  }));

export default function TrioxDashboard() {
  const clientRef = useRef<MqttClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [mqttError, setMqttError] = useState<string | null>(null);

  // Telemetry State
  const [telemetry, setTelemetry] = useState({
    temp: '--',
    humidity: '--',
    uptime: '--',
    persons: 0,
    mode: 'Idle',
    energy: '--',
  });

  // Device states
  const [deviceStates, setDeviceStates] = useState(() => getShuffledDeviceStates());

  // MQTT Connection
  useEffect(() => {
    let mqttClient: MqttClient | null = null;
    let isSubscribed = false;

    const connectMqtt = () => {
      try {
        console.log('🚀 Initializing MQTT client...');
        mqttClient = createMqttClient();

        // Connection events
        mqttClient.on('connect', () => {
          console.log('✅ MQTT Connected successfully!');
          setIsConnected(true);
          setIsConnecting(false);
          setMqttError(null);

          // Subscribe to topics
          if (!isSubscribed) {
            mqttClient?.subscribe(['home/room1/data', 'home/room1/status'], { qos: 1 }, (err) => {
              if (err) {
                console.error('❌ Subscription error:', err);
                setMqttError(`Subscription failed: ${err.message}`);
                return;
              }
              console.log('✅ Subscribed to home/room1 topics');
              isSubscribed = true;
            });
          }
        });

        // Message handler
        mqttClient.on('message', (topic, message) => {
          const payloadString = message.toString();
          console.log(`📨 Message on ${topic}:`, payloadString);

          if (topic === 'home/room1/data') {
            try {
              const parsedData = JSON.parse(payloadString);
              if (typeof parsedData !== 'object' || parsedData === null) return;

              if (parsedData.temp !== undefined || parsedData.dht !== undefined) {
                setTelemetry((prev) => ({
                  ...prev,
                  temp: parsedData.temp ?? prev.temp,
                  humidity: parsedData.dht ?? parsedData.humidity ?? prev.humidity,
                  uptime: parsedData.uptime ?? prev.uptime,
                }));
              }

              for (const [key, value] of Object.entries(parsedData)) {
                const match = key.match(/^led(\d+)$/i);
                if (!match) continue;

                const index = Number(match[1]) - 1;
                if (index >= 0 && index < deviceTemplates.length) {
                  setDeviceStates((prev) => {
                    const updated = [...prev];
                    if (updated[index]) updated[index].isOn = String(value).toUpperCase() === 'ON';
                    return updated;
                  });
                }
              }
            } catch (error) {
              console.error('Failed to parse telemetry JSON:', error);
            }
          }

          if (topic === 'home/room1/status') {
            const status = payloadString.trim().toLowerCase();
            if (status === 'online' || status === 'offline') {
              console.log(`Device status: ${status}`);
            }
          }
        });

        // Error handlers
        mqttClient.on('error', (err) => {
          console.error('❌ MQTT Error:', err);
          setIsConnected(false);
          setIsConnecting(false);
          setMqttError(err.message || 'Connection error');
        });

        mqttClient.on('offline', () => {
          console.warn('📴 MQTT went offline');
          setIsConnected(false);
        });

        mqttClient.on('reconnect', () => {
          console.log('🔄 Attempting to reconnect...');
          setIsConnecting(true);
        });

        mqttClient.on('close', () => {
          console.log('🔌 MQTT connection closed');
          setIsConnected(false);
        });

        clientRef.current = mqttClient;

      } catch (error) {
        const message = error instanceof Error ? error.message : 'MQTT configuration error';
        console.error('❌ MQTT initialization error:', error);
        setMqttError(message);
        setIsConnecting(false);
      }
    };

    connectMqtt();

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up MQTT connection...');
      if (mqttClient) {
        mqttClient.end(true, () => {
          console.log('✅ MQTT client disconnected');
        });
      }
      clientRef.current = null;
      isSubscribed = false;
};
  }, []);

  // Toggle device function with MQTT publish
  const toggleDevice = (index: number) => {
    const device = deviceStates[index];
    if (!device) return;

    const nextState = !device.isOn;
    const deviceNum = index + 1;
    
    // ✅ Format: LED1-ON or LED1-OFF (as per your requirement)
    const cmdMessage = `LED${deviceNum}-${nextState ? 'ON' : 'OFF'}`;

    console.log(`📤 Publishing command: ${cmdMessage}`);

    // Optimistic UI update
    setDeviceStates((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index].isOn = nextState;
      }
      return updated;
    });

    // Send MQTT command
    if (clientRef.current && isConnected) {
      clientRef.current.publish('home/room1/cmd', cmdMessage, { qos: 1 }, (err) => {
        if (err) {
          console.error('❌ Failed to publish command:', err);
          // Revert optimistic update on error
          setDeviceStates((prev) => {
            const updated = [...prev];
            if (updated[index]) {
              updated[index].isOn = !nextState;
            }
            return updated;
          });
          setMqttError(`Failed to send command: ${err.message}`);
        } else {
          console.log('✅ Command published successfully');
        }
      });
    } else {
      console.warn('⚠️ Cannot publish: client not connected');
      // Revert optimistic update
      setDeviceStates((prev) => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index].isOn = !nextState;
        }
        return updated;
      });
    }
  };

  // Publish test message
  const publishTestMessage = () => {
    if (clientRef.current && isConnected) {
      const testData = {
        temp: Math.round(20 + Math.random() * 10),
        humidity: Math.round(40 + Math.random() * 30),
        persons: Math.round(Math.random() * 3),
        mode: Math.random() > 0.5 ? 'Active' : 'Idle',
        energy: Math.round(50 + Math.random() * 150),
        uptime: '00:00:05'
      };
      const payload = JSON.stringify(testData);
      clientRef.current.publish('home/room1/data', payload, { qos: 1 }, (err) => {
        if (err) {
          console.error('❌ Failed to publish test message:', err);
        } else {
          console.log('✅ Test message published:', testData);
        }
      });
    } else {
      console.warn('⚠️ Cannot publish test: client not connected');
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-4 flex flex-col items-center justify-center font-sans">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <header className="flex justify-between items-center bg-slate-900/80 backdrop-blur-md p-4 rounded-3xl border border-slate-800 shadow-xl">
          <div>
            <h1 className="text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-yellow-200">
              Triox
            </h1>
            <p className="text-xs text-slate-400 font-medium">Smart Automation Hub</p>
          </div>
          <div
            className={`flex flex-col items-end gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : isConnecting
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Wifi className="w-3.5 h-3.5" />
              ) : isConnecting ? (
                <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              <span>
                {isConnected ? 'Live' : isConnecting ? 'Connecting...' : 'Offline'}
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              MQTT: {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
            </div>
          </div>
        </header>

        {/* Connection Status */}
        {mqttError && (
          <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-2xl text-center">
            <p className="text-sm text-rose-400">⚠️ {mqttError}</p>
            <button 
              onClick={() => {
                setMqttError(null);
                setIsConnecting(true);
                // Reconnect logic
                if (clientRef.current) {
                  clientRef.current.end(true);
                  clientRef.current = null;
                }
                // Trigger reconnection
                const newClient = createMqttClient();
                clientRef.current = newClient;
              }}
              className="mt-2 text-xs text-amber-400 hover:text-amber-300 underline"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Test Publish Button (for debugging) */}
        <div className="flex justify-end">
          <button
            onClick={publishTestMessage}
            disabled={!isConnected}
            className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-slate-300 transition-colors"
          >
            Send Test Data
          </button>
        </div>

        {/* Telemetry Dashboard */}
        <div className="bg-slate-900/60 backdrop-blur-xl p-5 rounded-3xl border border-slate-800/80 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            Room 1 Telemetry
          </h2>

          <div className="grid grid-cols-2 gap-3">
            {/* Temperature */}
            <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/50 flex items-center space-x-3">
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                <Thermometer className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Temp</p>
                <p className="text-sm font-bold text-slate-100">{telemetry.temp}°C</p>
              </div>
            </div>

            {/* Humidity */}
            <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/50 flex items-center space-x-3">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                <Droplets className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Humidity</p>
                <p className="text-sm font-bold text-slate-100">{telemetry.humidity}%</p>
              </div>
            </div>

            {/* Occupancy */}
            <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/50 flex items-center space-x-3">
              <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Occupancy</p>
                <p className="text-sm font-bold text-slate-100">{telemetry.persons} Pres.</p>
              </div>
            </div>

            {/* Energy */}
            <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/50 flex items-center space-x-3">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Energy</p>
                <p className="text-sm font-bold text-slate-100">{telemetry.energy} W</p>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800/60 flex justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" /> Up: {telemetry.uptime}
            </span>
            <span
              className={`font-semibold px-2 py-0.5 rounded-full text-[10px] ${
                telemetry.mode?.toLowerCase() === 'active'
                  ? 'bg-amber-400/20 text-amber-300'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {telemetry.mode} Mode
            </span>
          </div>
        </div>

        {/* Device Controls */}
        <div className="bg-slate-900/60 backdrop-blur-xl p-5 rounded-3xl border border-slate-800/80 shadow-2xl">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
            <Power className="w-4 h-4 text-amber-400" />
            Device Controls
          </h2>
          
          <div className="grid grid-cols-3 gap-4">
            {deviceStates.map((device, index) => (
              <div key={device.id} className="flex flex-col items-center space-y-2">
                <button
                  onClick={() => toggleDevice(index)}
                  disabled={!isConnected}
                  className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-300 transform active:scale-90 ${
                    device.isOn
                      ? `bg-gradient-to-tr ${device.color} text-slate-950 shadow-[0_0_25px_rgba(245,158,11,0.85)] border-2 border-yellow-200`
                      : 'bg-slate-950 text-slate-600 border border-slate-800 hover:border-slate-700 shadow-inner'
                  } ${!isConnected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {device.isOn ? device.emoji : '⚪'}
                </button>
                <div className="flex flex-col items-center">
                  <span className="text-[11px] font-medium text-slate-300">{device.name}</span>
                  <span className={`text-[8px] ${device.isOn ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {device.isOn ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/60 text-center">
            <p className="text-[10px] text-slate-500">
              {isConnected ? '🟢 Click devices to toggle' : '🔴 CloudServer not connected'}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}