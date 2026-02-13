const fs = require('fs');
const API_URL = 'http://localhost:5000/api'; // Adjust port if needed

async function testPricing() {
    try {
        let logOutput = '';
        const log = (msg) => {
            console.log(msg);
            logOutput += msg + '\n';
        };

        log('1. Fetching a car...');
        const carsResponse = await fetch(`${API_URL}/cars?limit=1`);
        const carsData = await carsResponse.json();

        if (!carsData.data || carsData.data.length === 0) {
            log('No cars found to test with.');
            fs.writeFileSync('test_output.txt', logOutput);
            return;
        }

        const car = carsData.data[0];
        log(`Using Car: ${car.brand} ${car.model} (ID: ${car._id})`);
        log(`Base Price Per Day (200km Tier): ${car.pricing.perDay}`);

        log('\n2. Testing calculatePrice with 3 Days + 9 Hours...');

        const startDate = "2026-02-13T10:00:00.000Z";
        const endDate = "2026-02-16T19:00:00.000Z"; // 3 Days 9 Hours = 3.375 Days

        const priceResponse = await fetch(`${API_URL}/cars/calculate-price`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                carId: car._id,
                startDate,
                endDate
            })
        });

        const priceData = await priceResponse.json();
        log('\n--- Pricing Calculation Result ---');
        log(JSON.stringify(priceData.data, null, 2));

        log('\n3. Testing getAllCars with Date Range...');
        const listUrl = `${API_URL}/cars?startDate=${startDate}&endDate=${endDate}&limit=1`;
        const listResponse = await fetch(listUrl);
        const listData = await listResponse.json();

        if (listData.data && listData.data.length > 0) {
            const listCar = listData.data[0];
            log('\n--- List View Pricing Injection ---');
            log(JSON.stringify(listCar.calculatedPricing, null, 2));
        } else {
            log('\n--- List View: No cars found for dates ---');
        }

        fs.writeFileSync('test_output.txt', logOutput);

    } catch (error) {
        console.error('Error:', error);
        fs.writeFileSync('test_output.txt', 'Error: ' + error.message);
    }
}

testPricing();
