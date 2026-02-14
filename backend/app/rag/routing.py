from __future__ import annotations
from dataclasses import dataclass

@dataclass(frozen=True)
class Route:
    feature: str
    collection: str
    template: str  # name of template in templates.py

ROUTES = {
    # Topic views
    "topic_medicine": Route("topic_medicine", "medicine_harrison", "medicine_monograph"),
    "topic_obgyn":    Route("topic_obgyn",    "obgyn_dutta",      "obgyn_monograph"),
    "topic_surgery":  Route("topic_surgery",  "surgery_oxford",   "surgery_monograph"),
    "topic_peds":     Route("topic_peds",     "pediatrics_oxford","peds_monograph"),

    # Drug features
    "drug_details":      Route("drug_details",      "drugs_mims_kd","drug_monograph"),
    "drug_interactions": Route("drug_interactions", "drugs_mims_kd","drug_interactions"),
}
