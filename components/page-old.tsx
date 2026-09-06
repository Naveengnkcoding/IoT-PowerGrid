'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createMqttClient } from '@/lib/mqtt';
import { Thermometer, Droplets, Clock, Users, Activity, Zap, Wifi, WifiOff } from 'lucide-react';
import type { MqttClient } from 'mqtt';

export default function TrioxDashboard() {
  const clientRef = useRef<MqttClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
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

  // Devices list: 3 Bulbs, 2 Tube Lights, 2 Fans, 1 AC, 1 Outlet (randomized order)
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

  const shuffleArray = (arr: string[]) => {
    const copy = [...arr];
    // for (let i = copy.length - 1; i > 0; i--) {
    //   // const j = Math.floor(Math.random() * (i + 1));
    //   [copy[i], copy[j]] = [copy[j], copy[i]];
    // }
    return copy;
  };

  // Initialize deterministically to avoid server/client markup mismatch.
  const [deviceStates, setDeviceStates] = useState(
    () => deviceTemplates.map((name, i) => ({ id: i + 1, name, isOn: false }))
  );

  // Shuffle on client after mount to avoid hydration mismatches.
  useEffect(() => {
    const t = setTimeout(() => {
      setDeviceStates(shuffleArray(deviceTemplates).map((name, i) => ({ id: i + 1, name, isOn: false })));
    }, 0);
    return () => clearTimeout(t);
    // deviceTemplates is static
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mqttClient: MqttClient;

    try {
      mqttClient = createMqttClient();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MQTT configuration error';
      const timer = window.setTimeout(() => setMqttError(message), 0);
      return () => window.clearTimeout(timer);
    }

    mqttClient.on('connect', () => {
      setIsConnected(true);
      setMqttError(null);
      // Subscribe to telemetry and device status topics
      mqttClient.subscribe(['home/room1/data', 'home/room1/status'], (err) => {
        if (err) {
          setMqttError(`MQTT subscription failed: ${err.message}`);
          return;
        }
        console.log('Subscribed to home/room1 topics successfully');
      });
    });

    mqttClient.on('message', (topic, message) => {
      const payloadString = message.toString();

      if (topic === 'home/room1/data') {
        try {
          const parsedData = JSON.parse(payloadString);
          setTelemetry((prev) => ({ ...prev, ...parsedData }));
        } catch (e) {
          console.error('Failed to parse telemetry JSON:', e);
        }
      }

      if (topic === 'home/room1/status') {
        // Expected formats: "LED1:ON", "LED1:OFF", or JSON {"led1": "ON"}
        let ledKey = '';
        let statusVal = '';

        if (payloadString.includes(':')) {
          const parts = payloadString.split(':');
          ledKey = parts[0].trim().toUpperCase();
          statusVal = parts[1].trim().toUpperCase();
        } else {
          try {
            const parsed = JSON.parse(payloadString);
            const key = Object.keys(parsed)[0];
            ledKey = key.toUpperCase();
            statusVal = String(parsed[key]).toUpperCase();
          } catch (e) {
            console.error('Invalid status payload format', e);
          }
        }

        const match = ledKey.match(/\d+/);
        if (match) {
          const index = parseInt(match[0], 10) - 1;
          if (index >= 0 && index < 9) {
            setDeviceStates((prev) => {
              const updated = [...prev];
              if (updated[index]) updated[index].isOn = statusVal === 'ON';
              return updated;
            });
          }
        }
      }
    });

    mqttClient.on('offline', () => setIsConnected(false));
    mqttClient.on('error', (err) => {
      setIsConnected(false);
      const errorCode = 'code' in err ? err.code : 'unknown';
      setMqttError(err.message || `MQTT connection error (${errorCode})`);
    });

    clientRef.current = mqttClient;

    return () => {
      if (mqttClient) mqttClient.end();
      clientRef.current = null;
    };
  }, []);

  const toggleDevice = (index: number) => {
    const deviceNum = index + 1;
    const currentState = deviceStates[index].isOn;
    const nextState = !currentState;
    const cmdMessage = `LED${deviceNum}-${nextState ? 'ON' : 'OFF'}`;

    // Optimistic UI update
    setDeviceStates((prev) => {
      const updated = [...prev];
      updated[index].isOn = nextState;
      return updated;
    });

    // Send MQTT Command (keeps LEDn-ON naming per requirement)
    if (clientRef.current && isConnected) {
      clientRef.current.publish('home/room1/cmd', cmdMessage);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-4 flex flex-col items-center justify-center font-sans">
      <div className="w-full max-w-md space-y-10">
        {/* Header */}
        <header className="flex justify-between items-center bg-slate-900/80 backdrop-blur-md p-4 rounded-3xl border border-slate-800 shadow-xl">
          <div>
            <h1 className="text-2xl font-black tracking-wider text-transparent bg-clip-text bg-linear-to-r from-amber-400 via-orange-500 to-yellow-200">
              Triox
            </h1>
            <p className="text-xs text-slate-400 font-medium">Smart Automation Hub</p>
          </div>
          <div
            className={`flex flex-col items-end gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            <div className="flex items-center gap-2">
              {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{isConnected ? 'Live' : 'Offline'}</span>
            </div>
            <div className="text-[10px] text-slate-400">MQTT: {isConnected ? 'Connected' : 'Disconnected'}</div>
          </div>
        </header>

        {/* Consolidated Telemetry Dash Card */}
        <div className="bg-slate-900/60 backdrop-blur-xl p-5 rounded-3xl border border-slate-800/80 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            Room 1 Telemetry
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/50 flex items-center space-x-3">
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                <Thermometer className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Temp</p>
                <p className="text-sm font-bold text-slate-100">{telemetry.temp}°C</p>
              </div>
            </div>

            <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/50 flex items-center space-x-3">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                <Droplets className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Humidity</p>
                <p className="text-sm font-bold text-slate-100">{telemetry.humidity}%</p>
              </div>
            </div>

            <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/50 flex items-center space-x-3">
              <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Occupancy</p>
                <p className="text-sm font-bold text-slate-100">{telemetry.persons} Pres.</p>
              </div>
            </div>

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

        {mqttError && (
          <div className="mt-3 text-sm text-red-400 text-center">MQTT Error: {mqttError}</div>
        )}

        {/* Device Controls (max 3 per row) */}
        <div className="bg-slate-900/60 backdrop-blur-xl p-5 rounded-3xl border border-slate-800/80 shadow-2xl">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
            Device Controls
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {deviceStates.map((device, index) => {
              const emoji =
                device.name.includes('Bulb')
                  ? '💡'
                  : device.name.includes('Tube')
                  ? '🔆'
                  : device.name.includes('Fan')
                  ? '🌀'
                  : device.name.includes('AC')
                  ? '❄️'
                  : device.name.includes('Outlet')
                  ? '🔌'
                  : '🔘';

              return (
                <div key={device.id} className="flex flex-col items-center space-y-2">
                  <button
                    onClick={() => toggleDevice(index)}
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-300 transform active:scale-90 ${
                      device.isOn
                        ? 'bg-linear-to-tr from-amber-500 to-yellow-300 text-slate-950 shadow-[0_0_25px_rgba(245,158,11,0.85)] border-2 border-yellow-200'
                        : 'bg-slate-950 text-slate-600 border border-slate-800 hover:border-slate-700 shadow-inner'
                    }`}
                  >
                    {emoji}
                  </button>
                  <span className="text-[11px] font-medium text-slate-300">{device.name} </span> 
                  {/* {device.id} */}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}