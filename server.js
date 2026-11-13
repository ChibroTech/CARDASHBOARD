const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname)); // serve current directory

const connectionString = "mongodb://localhost:27017/carsaledb";

// Connect to MongoDB
mongoose.connect(connectionString, {
  family: 4,
//   useNewUrlParser: true,
//   useUnifiedTopology: true
})
.then(() => console.log("✅ Connected to MongoDB database: carsaledb"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// Define Car schema (matching the embedded JSON structure)
const carSchema = new mongoose.Schema({
  _id: String,
  Model: String,
  Manufacturer: {
    Manufacturer: String,
    ManufacturerID: Number
  },
  Dealer: {
    DealerName: String,
    DealerCity: String,
    Latitude: Number,
    Longitude: Number,
    DealerID: Number
  },
  EngineSize: Number,
  FuelType: String,
  YearOfManufacturing: Number,
  Mileage: Number,
  Price: Number,
  Features: [String],
  Services: [{
    ServiceID: String,
    ServiceDate: String,
    ServiceType: String,
    ServiceCost: Number
  }],
  Accidents: [{
    AccidentID: String,
    AccidentDate: String,
    RepairCost: Number,
    Severity: String,
    Description: String
  }]
}, { collection: 'cars' }); // explicitly specify collection name

// Create model
const Car = mongoose.model('Car', carSchema);

/* =========================================================================
   API ROUTE: GET /cars (with filtering, sorting, and PAGINATION)

   ========================================================================= */

app.get('/cars', async (req, res) => {
  try {
    // Initialize empty query object
    // This will hold all our filter conditions
    const query = {};
    
    // Extract all query parameters from the URL
    // req.query contains all parameters after the ? in the URL
    // Example: /cars?model=civic&page=2&limit=20
    const { 
      model, 
      manufacturer, 
      fuelType, 
      minYear, 
      maxYear, 
      minPrice, 
      maxPrice, 
      sort,
      page,      // NEW: Current page number
      limit      // NEW: Results per page
    } = req.query;
    
    /* =====================================================
       PAGINATION PARAMETERS SETUP
       ===================================================== */
    
    // Set default values for pagination
    // parseInt() converts string to number (URL parameters are always strings)
    // || means "or" - if page is not provided or is invalid, use 1
    const currentPage = parseInt(page) || 1;        // Default: page 1
    const resultsPerPage = parseInt(limit) || 20;   // Default: 20 results per page
    
    // Calculate how many results to skip
    // Formula: (page - 1) × limit
    // Example: Page 3 with 20 per page → skip (3-1)×20 = skip 40 results
    const skipResults = (currentPage - 1) * resultsPerPage;
    
    /* =====================================================
       FILTERING - Same as before
       ===================================================== */
    
    // Filter by model name (case-insensitive partial match)
    // $regex allows pattern matching (like SQL LIKE)
    // $options: 'i' means case-insensitive
    if (model) {
      query.Model = { $regex: model, $options: 'i' };
    }
    
    // Filter by manufacturer (exact match)
    // We use dot notation to access nested fields: Manufacturer.Manufacturer
    if (manufacturer) {
      query['Manufacturer.Manufacturer'] = manufacturer;
    }
    
    // Filter by fuel type (exact match)
    if (fuelType) {
      query.FuelType = fuelType;
    }
    
    // Filter by year range
    // $gte = greater than or equal, $lte = less than or equal
    if (minYear || maxYear) {
      query.YearOfManufacturing = {};
      if (minYear) query.YearOfManufacturing.$gte = Number(minYear);
      if (maxYear) query.YearOfManufacturing.$lte = Number(maxYear);
    }
    
    // Filter by price range
    if (minPrice || maxPrice) {
      query.Price = {};
      if (minPrice) query.Price.$gte = Number(minPrice);
      if (maxPrice) query.Price.$lte = Number(maxPrice);
    }

    /* =====================================================
       SORTING
       ===================================================== */
    
    // Apply sorting if specified
    // 1 = ascending (low to high), -1 = descending (high to low)
    const sortOption = {};
    if (sort === 'asc') sortOption.Price = 1;
    else if (sort === 'desc') sortOption.Price = -1;

    /* =====================================================
       DATABASE QUERIES - The actual data fetching
       ===================================================== */
    
    // Count total matching documents (BEFORE pagination)
    // This tells us how many total results match the filters
    // We need this to calculate total pages
    const totalResults = await Car.countDocuments(query);
    
    // Fetch the cars for the current page
    // .find(query) - finds documents matching our filters
    // .sort(sortOption) - sorts the results
    // .skip(skipResults) - skips the first X results (for pagination)
    // .limit(resultsPerPage) - only returns X results (page size)
    const cars = await Car.find(query)
      .sort(sortOption)
      .skip(skipResults)           // NEW: Skip previous pages
      .limit(resultsPerPage);      // NEW: Limit results per page

    /* =====================================================
       CALCULATE PAGINATION METADATA
       ===================================================== */
    
    // Calculate total number of pages
    // Math.ceil() rounds UP to nearest integer
    // Example: 45 results ÷ 20 per page = 2.25 → rounds up to 3 pages
    const totalPages = Math.ceil(totalResults / resultsPerPage);
    
    // Determine if there are previous/next pages
    // These boolean values help the frontend show/hide navigation buttons
    const hasPrevPage = currentPage > 1;
    const hasNextPage = currentPage < totalPages;
    
    /* =====================================================
       SEND RESPONSE TO CLIENT
       ===================================================== */
    
    // Send JSON response with data AND pagination info
    res.json({
      // The actual data
      cars: cars,
      
      // Pagination metadata - helps frontend build navigation
      pagination: {
        currentPage: currentPage,        // Current page number
        totalPages: totalPages,          // Total number of pages
        totalResults: totalResults,      // Total matching results
        resultsPerPage: resultsPerPage,  // Results per page
        hasPrevPage: hasPrevPage,        // Can go to previous page?
        hasNextPage: hasNextPage,        // Can go to next page?
        prevPage: hasPrevPage ? currentPage - 1 : null,  // Previous page number
        nextPage: hasNextPage ? currentPage + 1 : null   // Next page number
      }
    });
    
  } catch (err) {
    // If anything goes wrong, log the error and send error response
    console.error('Error fetching cars:', err);
    res.status(500).json({ error: 'Failed to fetch cars' });
  }
});

// API route to get distinct manufacturers
app.get('/manufacturers', async (req, res) => {
  try {
    const manufacturers = await Car.distinct('Manufacturer.Manufacturer');
    res.json(manufacturers.sort());
  } catch (err) {
    console.error('Error fetching manufacturers:', err);
    res.status(500).json({ error: 'Failed to fetch manufacturers' });
  }
});

// API route to get statistics
app.get('/stats', async (req, res) => {
  try {
    const totalCars = await Car.countDocuments();
    const avgPriceResult = await Car.aggregate([
      { $group: { _id: null, avgPrice: { $avg: "$Price" } } }
    ]);
    const avgMileageResult = await Car.aggregate([
      { $group: { _id: null, avgMileage: { $avg: "$Mileage" } } }
    ]);
    
    res.json({
      totalCars,
      avgPrice: avgPriceResult.length > 0 ? avgPriceResult[0].avgPrice : 0,
      avgMileage: avgMileageResult.length > 0 ? avgMileageResult[0].avgMileage : 0
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Serve the car dashboard HTML file when the root is requested
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));