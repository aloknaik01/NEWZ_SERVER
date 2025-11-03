import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from './config/passport.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import newsRoutes from './routes/newsRoutes.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import { securityHeaders, apiLimiter } from './middlewares/security.js';
import cookieParser from 'cookie-parser';


const app = express();

// Security headers
app.use(securityHeaders);

// CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://10.247.101.108:5000',
  credentials: true
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


//COOKIE PARSER
app.use(cookieParser());

// Session for Google OAuth
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// API rate limiting
// app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api', newsRoutes);

// Error handlers
app.use(notFound);
app.use(errorHandler);

export default app;