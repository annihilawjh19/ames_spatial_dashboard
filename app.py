from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from flask import Flask, jsonify, render_template, request
from sklearn.cluster import KMeans
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_absolute_error, root_mean_squared_error
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

# --------------------------------------------------
# Basic setup
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "AmesHousingSpatial.csv"
TARGET = "Sale_Price"

app = Flask(__name__)


# --------------------------------------------------
# Load data
# --------------------------------------------------

def load_data():
    df = pd.read_csv(DATA_PATH)
    df = df.dropna(subset=[TARGET, "Latitude", "Longitude"])
    return df


DF = load_data()


# --------------------------------------------------
# Feature selection
# --------------------------------------------------

NUM_COLS = DF.select_dtypes(include=np.number).columns.tolist()
NUM_COLS.remove(TARGET)

# --------------------------------------------------
# Train/Test split
# --------------------------------------------------

X = DF.drop(columns=[TARGET])
y = DF[TARGET]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)


# --------------------------------------------------
# Random Forest model
# --------------------------------------------------

rf_model = RandomForestRegressor(
    n_estimators=300,
    random_state=42,
    n_jobs=-1
)

rf_model.fit(X_train[NUM_COLS], y_train)

rf_pred = rf_model.predict(X_test[NUM_COLS])



# --------------------------------------------------
# Linear Regression model
# --------------------------------------------------

lin_model = LinearRegression()

lin_model.fit(X_train[NUM_COLS], y_train)

lin_pred = lin_model.predict(X_test[NUM_COLS])

# --------------------------------------------------
# Model metrics
# --------------------------------------------------

MODEL_METRICS = {
    "random_forest": {
        "r2": round(r2_score(y_test, rf_pred), 4),
        "rmse": round(root_mean_squared_error(y_test, rf_pred), 2),
        "mae": round(mean_absolute_error(y_test, rf_pred), 2),
    },
    "linear_regression": {
        "r2": round(r2_score(y_test, lin_pred), 4),
        "rmse": round(root_mean_squared_error(y_test, lin_pred), 2),
        "mae": round(mean_absolute_error(y_test, lin_pred), 2),
    },
}


# --------------------------------------------------
# Feature importance
# --------------------------------------------------

importance = rf_model.feature_importances_

FEATURE_IMPORTANCE_DF = (
    pd.DataFrame({"feature": NUM_COLS, "importance": importance})
    .sort_values("importance", ascending=False)
    .reset_index(drop=True)
)


# --------------------------------------------------
# Predicted price + residual
# --------------------------------------------------

DF["Predicted_Price"] = rf_model.predict(DF[NUM_COLS])
DF["Residual"] = DF[TARGET] - DF["Predicted_Price"]

print("\nUpdated DF with rf predicted prices and residuals:")
print(DF.loc[:5, ["Predicted_Price", TARGET, "Residual"]])
# --------------------------------------------------
# Clustering
# --------------------------------------------------

cluster_cols = [
    "Gr_Liv_Area",
    "Garage_Cars",
    "Total_Bsmt_SF",
    "Year_Built",
    #"Sale_Price",
]

cluster_data = DF[cluster_cols].fillna(DF[cluster_cols].median())

cluster_pipeline = Pipeline([
    ("scaler", StandardScaler()),
    ("kmeans", KMeans(n_clusters=4, random_state=42))
])

DF["Cluster"] = cluster_pipeline.fit_predict(cluster_data)

# --------------------------------------------------
# Filtering function
# --------------------------------------------------

def apply_filters(df: pd.DataFrame, args: dict[str, Any]) -> pd.DataFrame:
    result = df.copy()

    neighborhood = args.get("neighborhood")
    if neighborhood and neighborhood != "All":
        result = result[result["Neighborhood"] == neighborhood]

    min_price = args.get("min_price")
    if min_price not in (None, ""):
        result = result[result[TARGET] >= float(min_price)]

    max_price = args.get("max_price")
    if max_price not in (None, ""):
        result = result[result[TARGET] <= float(max_price)]

    min_year = args.get("min_year")
    if min_year not in (None, ""):
        result = result[result["Year_Built"] >= float(min_year)]

    max_year = args.get("max_year")
    if max_year not in (None, ""):
        result = result[result["Year_Built"] <= float(max_year)]

    min_qual = args.get("min_qual")
    if min_qual not in (None, ""):
        result = result[result["Overall_Cond_Num"] >= float(min_qual)]

    return result


# --------------------------------------------------
# Routes
# --------------------------------------------------

@app.route("/")
def index():

    neighborhoods = sorted(DF["Neighborhood"].dropna().unique())
    return render_template("index.html", neighborhoods=neighborhoods)


@app.route("/api/summary")
def summary():
    quality_map = {
        "Very_Poor": 1,
        "Poor": 2,
        "Below_Average": 3,
        "Average": 4,
        "Above_Average": 5,
        "Good": 6,
        "Very_Good": 7,
        "Excellent": 8
    }

    DF["Overall_Cond_Num"] = DF["Overall_Cond"].map(quality_map)
    return jsonify(
        {
            "row_count": int(len(DF)),
            "column_count": int(DF.shape[1]),
            "price_min": float(DF[TARGET].min()),
            "price_max": float(DF[TARGET].max()),
            "price_mean": float(DF[TARGET].mean()),
            "neighborhoods": sorted(DF["Neighborhood"].dropna().unique().tolist()),
            "year_min": int(DF["Year_Built"].min()),
            "year_max": int(DF["Year_Built"].max()),
            "quality_min": int(DF["Overall_Cond_Num"].min()),
            "quality_max": int(DF["Overall_Cond_Num"].max()),
            "model_metrics": MODEL_METRICS,
        }
    )


@app.route("/api/houses")
def houses():
    filtered = apply_filters(DF, request.args)

    metric = request.args.get("metric", "Sale_Price")

    cols = [
        "Latitude",
        "Longitude",
        "Neighborhood",
        "Sale_Price",
        "Predicted_Price",
        "Residual",
        "Cluster",
        "Overall_Cond",
        "Gr_Liv_Area",
        "Lot_Area",
        "Year_Built",
    ]

    data = filtered[cols].copy()
    data["metric"] = data[metric]

    return jsonify(data.to_dict(orient="records"))


@app.route("/api/neighborhoods")
def neighborhoods():
    filtered = apply_filters(DF, request.args)

    grouped = (
        filtered.groupby("Neighborhood")
        .agg(
            avg_price=(TARGET, "mean"),
            median_price=(TARGET, "median"),
            n_houses=(TARGET, "size"),
        )
        .reset_index()
        .sort_values("median_price", ascending=False)
    )

    return jsonify(grouped.to_dict(orient="records"))


@app.route("/api/price_histogram")
def price_histogram():
    filtered = apply_filters(DF, request.args)

    counts, bins = np.histogram(filtered[TARGET], bins=20)

    hist = [
        {
            "bin_start": float(bins[i]),
            "bin_end": float(bins[i + 1]),
            "count": int(counts[i]),
        }
        for i in range(len(counts))
    ]

    return jsonify(hist)


@app.route("/api/scatter")
def scatter():
    filtered = apply_filters(DF, request.args)

    x_var = request.args.get("x", "Gr_Liv_Area")
    y_var = request.args.get("y", TARGET)

    cols = [x_var, y_var, "Neighborhood", TARGET, "Latitude", "Longitude"]

    plot_df = filtered[cols].dropna().copy()

    plot_df.columns = ["x", "y", "Neighborhood", "Sale_Price", "Latitude", "Longitude"]

    return jsonify(plot_df.to_dict(orient="records"))


@app.route("/api/feature_importance")
def feature_importance():
    top_n = int(request.args.get("top_n", 20))
    result = FEATURE_IMPORTANCE_DF.head(top_n)
    return jsonify(result.to_dict(orient="records"))


@app.route("/api/clusters")
def clusters():
    filtered = apply_filters(DF, request.args)

    grouped = (
        filtered.groupby("Cluster")
        .agg(
            avg_price=(TARGET, "mean"),
            avg_area=("Gr_Liv_Area", "mean"),
            avg_quality=("Overall_Cond_Num", "mean"),
            n_houses=(TARGET, "size"),
        )
        .reset_index()
        .sort_values("Cluster")
    )

    return jsonify(grouped.to_dict(orient="records"))


# --------------------------------------------------
# Run server
# --------------------------------------------------

if __name__ == "__main__":
    app.run(host = "0.0.0.0", port = 10000)
