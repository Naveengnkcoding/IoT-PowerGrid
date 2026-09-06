#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h> // 👈 FIXED: Added missing secure header

#include <DHT.h>

#define dhtPin 18
     // Digital pin connected to the DHT sensor
#define DHTTYPE DHT22   // DHT 22  (AM2302), AM2321

DHT dht(dhtPin, DHTTYPE);

// ==========================================
// 1. CONFIGURATION
// ==========================================
const char* ssid = "Airtel_pras_6128";
const char* password = "air92859";

// MQTT Broker Settings
const char* mqtt_server = "bfb4089403574511a662765cfa5537be.s1.eu.hivemq.cloud";
const int mqtt_port = 8883; // 👈 Secure TLS Port
const char* mqtt_user = "wavedeccan";
const char* mqtt_pass = "11223344";

// Unique Device ID (Dynamically added MAC below to prevent broker collisions)
String device_id = "HOME_ROOM1-"; 

// Topics (Structure: device_type/device_id/function)
const char* topic_telemetry = "home/room1/data";   
const char* topic_command   = "home/room1/cmd";    
const char* topic_status    = "home/room1/status"; 

// ==========================================
// 2. GLOBAL OBJECTS & VARIABLES
// ==========================================
WiFiClientSecure espClient; // 👈 FIXED: Switched to secure client
PubSubClient client(espClient);

unsigned long lastMsgTime = 0;
const long interval = 5000; 

unsigned long lastDHTtime = 0;
const unsigned long DHTinterval = 1000; // 2 seconds

#define LED_PIN 12
#define led2 13 
#define builtled 2
int ldrsense = 0;
const int ldrPin = 22; 
float h = 0;
float t = 0;
float f = 0;

// ==========================================
// 3. SETUP WIFI
// ==========================================
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  
  // Append MAC address to device_id to ensure absolute uniqueness
  device_id += String(WiFi.macAddress());
}

// ==========================================
// 4. CALLBACK (Handle Incoming Messages)
// ==========================================
void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");

  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);

  if (String(topic) == topic_command) {
    if (message == "LED1-ON") {
      digitalWrite(LED_PIN, HIGH);
      client.publish(topic_telemetry, "{\"led1\": \"ON\"}"); 
    } else if (message == "LED1-OFF") {
      digitalWrite(LED_PIN, LOW);
      client.publish(topic_telemetry, "{\"led1\": \"OFF\"}");
    } else if (message == "LED2-ON") {
      digitalWrite(led2, HIGH);
      client.publish(topic_telemetry, "{\"led2\": \"ON\"}");
    } else if (message == "LED2-OFF") {
      digitalWrite(led2, LOW);
      client.publish(topic_telemetry, "{\"led2\": \"OFF\"}");
    }
    
  }
}

// ==========================================
// 5. RECONNECT
// ==========================================
void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    
    // Connect using dynamic device_id
    if (client.connect(device_id.c_str(), mqtt_user, mqtt_pass, topic_status, 1, true, "offline")) {
      Serial.println("connected");
      client.publish(topic_status, "online", true);
      client.subscribe(topic_command);
      digitalWrite(builtled,HIGH);
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(60000); 
    }
  }
}

void dhtread() {
    unsigned long currentTime = millis();
  
  // Check if 2 seconds have passed
  if (currentTime - lastTimeRun >= interval) {
    lastTimeRun = currentTime; // Reset the timer
    h = dht.readHumidity();
        // Read temperature as Celsius (default)
    t = dht.readTemperature();
        // Read temperature as Fahrenheit (isFahrenheit = true)
    f = dht.readTemperature(true);

        // Check if any reads failed and exit early to try again
  if (isnan(h) || isnan(t) || isnan(f)) {
    Serial.println(F("Failed to read from DHT sensor!"));
    return;
  }

  }
}

void logic_controll() {
    unsigned long currentTime = millis();
  
  // Check if 2 seconds have passed
  if (currentTime - lastTimeRun >= interval) {
    lastTimeRun = currentTime; // Reset the timer
    ////Logic Controll
    if(ldrsense == 1){
      digitalWrite(LED_PIN, LOW);
    }else{
      digitalWrite(LED_PIN, HIGH);
    }
    if(t > 31){
      digitalWrite(led2,LOW);
    }else{
      digitalWrite(led2,HIGH);
    }
  }
}

// ==========================================
// 6. MAIN SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(led2, OUTPUT);
  pinMode(builtled, OUTPUT);
  pinMode(ldrPin, INPUT);
  pinMode(dhtPin, INPUT);
  digitalWrite(led2,LOW);
  digitalWrite(LED_PIN, LOW);
  
  setup_wifi();
  
  espClient.setInsecure(); 
  
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

// ==========================================
// 7. MAIN LOOP
// ==========================================
void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop(); 
  unsigned long now = millis();
  if (now - lastMsgTime > interval) {
    lastMsgTime = now;
    JsonDocument doc; 
    doc["device"] = device_id;
    doc["uptime"] = millis() / 1000;
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["temp"] = t;
    doc["dht"] = h;
    doc["darkness"] = ldrsense;

    char buffer[256];
    serializeJson(doc, buffer);

    Serial.print("Publishing data: ");
    Serial.println(buffer);
    client.publish(topic_telemetry, buffer);
    ldrsense = digitalRead(ldrPin);
    dhtread();
    logic_controll();
  }
}