const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Helper to sign JWT
const signToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '7d' // Token expires in 7 days
    });
};

exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        // Create new user
        const newUser = await User.create({
            username,
            email,
            password
        });

        // Generate Token
        const token = signToken(newUser._id);

        // Remove password from output
        const userResponse = newUser.toObject();
        delete userResponse.password;

        res.status(201).json({
            status: 'success',
            token,
            data: {
                user: userResponse
            }
        });

    } catch (error) {
        res.status(400).json({
            status: 'fail',
            message: error.message
        });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1) Check if email and password exist
        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        // 2) Check if user exists && password is correct
        const user = await User.findOne({ email });

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ message: 'Incorrect email or password' });
        }

        // 3) Send token
        const token = signToken(user._id);

        // Remove password from output
        const userResponse = user.toObject();
        delete userResponse.password;

        res.status(200).json({
            status: 'success',
            token,
            data: {
                user: userResponse
            }
        });

    } catch (error) {
        res.status(400).json({
            status: 'fail',
            message: error.message
        });
    }
};
