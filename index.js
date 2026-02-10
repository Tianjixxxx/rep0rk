const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// User agents list
const ua_list = [
  "Mozilla/5.0 (Linux; Android 10; Wildfire E Lite) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/105.0.5195.136 Mobile Safari/537.36[FBAN/EMA;FBLC/en_US;FBAV/298.0.0.10.115;]",
  "Mozilla/5.0 (Linux; Android 11; KINGKONG 5 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/320.0.0.12.108;]",
  "Mozilla/5.0 (Linux; Android 11; G91 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/325.0.1.4.108;]"
];

// Store for share history
let shareHistory = [];

// Token extraction function
async function extract_token(cookie, ua) {
  try {
    const response = await axios.get(
      "https://business.facebook.com/business_locations",
      {
        headers: {
          "user-agent": ua,
          "referer": "https://www.facebook.com/",
          "Cookie": cookie
        },
        timeout: 10000
      }
    );

    const tokenMatch = response.data.match(/(EAAG\w+)/);
    return tokenMatch ? tokenMatch[1] : null;
  } catch (err) {
    console.error('Token extraction error:', err.message);
    return null;
  }
}

// Routes
app.get("/", (req, res) => {
  res.render("index");
});

app.get("/share", (req, res) => {
  res.render("share", { history: shareHistory.slice(-10) });
});

// API endpoint for sharing
app.post("/api/share", async (req, res) => {
  try {
    const { cookie, link: post_link, limit } = req.body;
    const limitNum = parseInt(limit, 10);

    // Basic validation (NO LIMIT CAP)
    if (!cookie || !post_link || !limitNum) {
      return res.json({
        status: false,
        message: "Missing required fields."
      });
    }

    const ua = ua_list[Math.floor(Math.random() * ua_list.length)];
    const token = await extract_token(cookie, ua);

    if (!token) {
      return res.json({
        status: false,
        message: "Token extraction failed. Check your cookie."
      });
    }

    let success = 0;
    const shareId = Date.now();
    const startTime = new Date();

    // Save initial history
    shareHistory.push({
      id: shareId,
      link: post_link,
      requested: limitNum,
      success: 0,
      status: 'processing',
      startTime,
      endTime: null
    });

    // Share loop (UNLIMITED BASED ON INPUT)
    for (let i = 0; i < limitNum; i++) {
      try {
        const response = await axios.post(
          "https://graph.facebook.com/v18.0/me/feed",
          null,
          {
            params: {
              link: post_link,
              access_token: token,
              published: 0
            },
            headers: {
              "user-agent": ua,
              "Cookie": cookie
            },
            timeout: 10000
          }
        );

        if (response.data && response.data.id) {
          success++;

          const historyItem = shareHistory.find(item => item.id === shareId);
          if (historyItem) {
            historyItem.success = success;
          }
        } else {
          break;
        }
      } catch (err) {
        console.error('Share attempt failed:', err.message);
        break;
      }
    }

    // Finalize history
    const finalItem = shareHistory.find(item => item.id === shareId);
    if (finalItem) {
      finalItem.status = 'completed';
      finalItem.endTime = new Date();
      finalItem.success = success;
    }

    res.json({
      status: true,
      message: success > 0
        ? `✅ Successfully shared ${success} times!`
        : 'No shares completed.',
      success_count: success,
      share_id: shareId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('API Error:', error);
    res.json({
      status: false,
      message: 'Server error occurred. Please try again.'
    });
  }
});

// Share history
app.get("/api/history", (req, res) => {
  res.json({
    status: true,
    history: shareHistory.slice(-20).reverse()
  });
});

// Running shares
app.get("/api/running-shares", (req, res) => {
  const runningShares = shareHistory.filter(item => item.status === 'processing');
  res.json({
    status: true,
    running_shares: runningShares
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});