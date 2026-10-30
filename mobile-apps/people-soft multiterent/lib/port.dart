import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

// Set to true during local development to hit your local server.
const bool useLocalBackend = true;

/// The local network IP of your dev machine (used when useLocalBackend = true).
const String _localIp = '192.168.0.100';
const int _localPort = 5001;

String getBaseUrl() {
  if (useLocalBackend) {
    if (kIsWeb) return 'http://localhost:$_localPort';
    if (Platform.isAndroid || Platform.isIOS) {
      // Connects to local dev machine IP over Wi-Fi (for wireless debugging) or 127.0.0.1 with adb reverse
      return 'http://$_localIp:$_localPort';
    }
    return 'http://localhost:$_localPort';
  }
  return 'https://peoplesoft.softrateglobal.com/hrms-api';
}
