/* Example API responses for the static demo (same shapes as the backend in backend/). */
window.MOCK_API_RESPONSES = {
  "GET /api/app": {
    "status": 200,
    "body": {
      "app": {
        "name": "Skywatch",
        "version": "3.4.1"
      },
      "rating": {
        "average": 4.8,
        "count": 12400
      },
      "downloads": 386000,
      "screens": [
        {
          "id": "alerts",
          "title": "Geçiş uyarıları"
        },
        {
          "id": "compass",
          "title": "Gökyüzü pusulası"
        },
        {
          "id": "launches",
          "title": "Fırlatma takvimi"
        }
      ],
      "links": {
        "phone": "https://lumendrift.example/phone",
        "tablet": "https://lumendrift.example/tablet"
      }
    },
    "delayMs": 400
  },
  "POST /api/app-link": {
    "status": 200,
    "body": {
      "ok": true,
      "channel": "sms",
      "platform": "tablet",
      "maskedDestination": "+47 ••• •• 532",
      "message": "Ulaşması bir dakikayı bulabilir."
    },
    "delayMs": 700
  }
};
