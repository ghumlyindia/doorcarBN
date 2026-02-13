const express = require('express');
const router = express.Router();
const carController = require('../controller/carController');
const { upload } = require('../config/cloudinary');

// Public Routes
router.get('/', carController.getAllCars);
router.get('/cities', carController.getAvailableCities);
router.get('/featured', carController.getFeaturedCars);
router.get('/check-availability', carController.checkAvailability);
router.post('/calculate-price', carController.calculatePrice);
router.get('/:id', carController.getCarById);

// Admin Routes
router.post('/add', carController.createCar); // Without images (legacy)
router.post('/add-with-images', upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'images', maxCount: 10 }
]), carController.createCarWithImages); // With images
router.put('/:id', upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'images', maxCount: 10 }
]), carController.updateCar);
router.delete('/:id', carController.deleteCar);

module.exports = router;