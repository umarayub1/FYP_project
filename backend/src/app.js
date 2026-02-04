const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;

// Database Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB Connected'))
  .catch((err) => console.log('MongoDB Connection Error:', err));

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
const authRoutes = require('./routes/authRoutes');
const { protect } = require('./middleware/authMiddleware');

app.use('/api/auth', authRoutes);

// Protected Test Route
app.get('/api/protected', protect, (req, res) => {
  res.json({ message: `Access granted! You are logged in as ${req.user.username}` });
});

app.get('/', (req, res) => {
  res.json({ message: 'Backend Service is running' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
