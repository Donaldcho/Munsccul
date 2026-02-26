import re
import io
import logging
from PIL import Image
import pytesseract
import spacy
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# Try to load spaCy model on import (cached in lifespan or module load)
try:
    nlp = spacy.load("en_core_web_sm")
except Exception as e:
    logger.warning(f"Failed to load spaCy model 'en_core_web_sm'. NER will be degraded: {e}")
    nlp = None

def extract_id_data(image_bytes: bytes) -> Dict[str, Optional[str]]:
    """
    Extracts text from an identity card image using Tesseract OCR,
    then uses regex and spaCy NER to identify key entities like Name, ID Number, and Expiry Date.
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))
        
        # Simple preprocessing to improve OCR (convert to grayscale)
        image = image.convert('L')
        
        # Run OCR
        raw_text = pytesseract.image_to_string(image)
        logger.debug(f"OCR Extracted text: {raw_text}")
        
        # Initialize extracted payload
        extracted_data = {
            "first_name": None,
            "last_name": None,
            "id_number": None,
            "expiry_date": None,
            "raw_text": raw_text
        }
        
        # 1. Regex Extraction for ID Number (typically 9 digits in Cameroon CNI)
        id_match = re.search(r'\b\d{9}\b', raw_text)
        if id_match:
            extracted_data["id_number"] = id_match.group(0)
            
        # 2. Extract Dates (Expiry) using standard formats like DD.MM.YYYY, DD/MM/YYYY
        date_matches = re.findall(r'\b\d{2}[./-]\d{2}[./-]\d{4}\b', raw_text)
        if date_matches:
            # The last date on the card is typically the expiry date
            date_str = date_matches[-1].replace('.', '-').replace('/', '-')
            extracted_data["expiry_date"] = date_str
            
        # 3. Use SpaCy NER for Names if available
        if nlp:
            doc = nlp(raw_text)
            persons = [ent.text.strip() for ent in doc.ents if ent.label_ == "PERSON"]
            
            # Very naive heuristic: First matched person might be the surname/first name combination
            if persons:
                name_parts = persons[0].split()
                if len(name_parts) >= 2:
                    extracted_data["first_name"] = name_parts[0]
                    extracted_data["last_name"] = " ".join(name_parts[1:])
                elif len(name_parts) == 1:
                    extracted_data["first_name"] = name_parts[0]
                    
        return extracted_data
        
    except Exception as e:
        logger.error(f"Failed to extract ID data using OCR: {e}")
        return {"error": str(e), "raw_text": ""}
