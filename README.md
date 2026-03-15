# Interactive Spatial Analysis of Ames Housing Prices

This Flask + D3 + Leaflet dashboard implements a spatial housing analysis project using `AmesHousingSpatial.csv`.

## Features
- Interactive map of homes by latitude/longitude
- Map coloring by actual price, predicted price, residual, or cluster
- Neighborhood comparison chart
- Sale price histogram
- Scatterplot of sale price vs. living area
- Random forest feature importance chart
- K-means cluster summary
- Server-side filtering by neighborhood, price, year built, and overall quality

## Project Structure

```text
ames_spatial_dashboard/
├── AmesHousingSpatial.csv
├── app.py
├── requirements.txt
├── README.md
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── styles.css
    └── js/
        └── app.js
```

## Run the App

```bash
cd ames_spatial_dashboard
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate   # Windows
pip install -r requirements.txt
python app.py
```

Then open the local address shown in the terminal, usually:

```text
http://127.0.0.1:5000/
```

## Notes
- The model uses a random forest regressor for prediction and a linear regression benchmark.
- Clusters are computed from selected numeric and spatial variables.
- The dataset does not include polygon neighborhood boundaries, so the dashboard uses point-level coordinates.
