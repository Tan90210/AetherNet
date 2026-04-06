"""
AetherNet FL  Data Validation Service

Checks if user-provided dataset is suitable for federated learning:
  ¢ Shape validation (matches model input)
  ¢ Format validation (images, text, audio, etc.)
  ¢ Data distribution checks
  ¢ Size checks
  ¢ Quality metrics
"""

import os
import csv
import json
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional
from PIL import Image
import numpy as np
from enum import Enum


class DataFamily(str, Enum):
    VISION="vision"
    VISION_TRANSFORMER="vision_transformer"
    NLP="nlp"
    AUDIO="audio"
    EDGE="edge"


class ValidationStatus(str, Enum):
    VALID="valid"
    WARNING="warning"
    INVALID="invalid"


class DataValidator:
    """Validates federated learning datasets."""

    VISION_FORMATS={'.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff'}

    AUDIO_FORMATS={'.wav', '.flac', '.mp3', '.ogg', '.m4a'}

    TEXT_FORMATS={'.txt', '.csv', '.json'}

    def __init__(self):
        self.errors: List[str]=[]
        self.warnings: List[str]=[]
        self.metadata: Dict[str, Any]={}

    def validate_vision_dataset(
        self,
        data_path: str,
        required_shape: Tuple[int, int],
        family: str=VISION_FORMATS,
        min_samples_per_class: int=10
    ) -> Tuple[ValidationStatus, Dict[str, Any]]:
        """
        Validate image dataset for vision models.
        Expected structure: data_path/class_name/image.jpg
        """
        self.errors=[]
        self.warnings=[]
        self.metadata={}

        data_path=Path(data_path)
        if not data_path.exists() or not data_path.is_dir():
            self.errors.append(f"Dataset path does not exist: {data_path}")
            return ValidationStatus.INVALID, self._generate_report()

        try:
            class_dirs=[d for d in data_path.iterdir() if d.is_dir()]
            if not class_dirs:
                self.errors.append("No class directories found. Expected structure: dataset/class_name/image.ext")
                return ValidationStatus.INVALID, self._generate_report()

            self.metadata['num_classes']=len(class_dirs)
            self.metadata['classes']=[d.name for d in class_dirs]
            self.metadata['samples_per_class']={}
            self.metadata['total_samples']=0
            self.metadata['invalid_images']=[]
            self.metadata['shape_mismatch']=[]

            target_h, target_w=required_shape
            all_shapes=[]

            for class_dir in class_dirs:
                class_name=class_dir.name
                images=[]

                for file in class_dir.iterdir():
                    if file.suffix.lower() in self.VISION_FORMATS:
                        try:
                            img=Image.open(file)
                            w, h=img.size
                            all_shapes.append((h, w))

                            if h!=target_h or w!=target_w:
                                self.metadata['shape_mismatch'].append({
                                    'file': file.name,
                                    'class': class_name,
                                    'expected': (target_h, target_w),
                                    'actual': (h, w)
                                })

                            images.append(file.name)
                        except Exception as e:
                            self.metadata['invalid_images'].append({
                                'file': file.name,
                                'error': str(e)
                            })

                count=len(images)
                self.metadata['samples_per_class'][class_name]=count
                self.metadata['total_samples']+=count

                if count==0:
                    self.errors.append(f"Class '{class_name}' has no valid images")
                elif count<min_samples_per_class:
                    self.warnings.append(f"Class '{class_name}' has only {count} images (minimum recommended: {min_samples_per_class})")

            if len(self.metadata['invalid_images'])>0:
                self.warnings.append(f"{len(self.metadata['invalid_images'])} invalid/corrupt images found")

            if len(self.metadata['shape_mismatch'])>0:
                pct=(len(self.metadata['shape_mismatch'])/self.metadata['total_samples'])*100
                self.warnings.append(f"{len(self.metadata['shape_mismatch'])} images ({pct:.1f}%) have mismatched shapes")

            counts=list(self.metadata['samples_per_class'].values())
            if len(counts)>1:
                min_count=min(counts)
                max_count=max(counts)
                imbalance=(max_count - min_count)/min_count
                if imbalance>2.0:
                    self.warnings.append(f"Dataset is imbalanced: largest class has {imbalance:.1f}x more samples")

            if self.metadata['total_samples']<100:
                self.warnings.append("Dataset is small (< 100 samples). Federated learning benefits from larger datasets.")

            self.metadata['ready_for_training']=len(self.errors)==0

            status=ValidationStatus.INVALID if self.errors else (ValidationStatus.WARNING if self.warnings else ValidationStatus.VALID)
            return status, self._generate_report()

        except Exception as e:
            self.errors.append(f"Unexpected error during validation: {str(e)}")
            return ValidationStatus.INVALID, self._generate_report()

    def validate_nlp_dataset(
        self,
        data_path: str,
        required_format: str="csv",
        required_columns: List[str]=None,
        min_samples: int=50
    ) -> Tuple[ValidationStatus, Dict[str, Any]]:
        """
        Validate NLP dataset (CSV with text and label columns).
        """
        if required_columns is None:
            required_columns=["text", "label"]

        self.errors=[]
        self.warnings=[]
        self.metadata={}

        data_path=Path(data_path)

        if required_format=="csv":
            if not data_path.suffix.lower()=='.csv':
                self.errors.append(f"Expected CSV file, got {data_path.suffix}")
                return ValidationStatus.INVALID, self._generate_report()

            if not data_path.exists():
                self.errors.append(f"File not found: {data_path}")
                return ValidationStatus.INVALID, self._generate_report()

            try:
                with open(data_path, 'r', encoding='utf-8') as f:
                    reader=csv.DictReader(f)
                    rows=list(reader)

                if not rows:
                    self.errors.append("CSV file is empty")
                    return ValidationStatus.INVALID, self._generate_report()

                actual_cols=set(rows[0].keys())
                missing_cols=set(required_columns) - actual_cols
                if missing_cols:
                    self.errors.append(f"Missing required columns: {missing_cols}")
                    return ValidationStatus.INVALID, self._generate_report()

                self.metadata['num_samples']=len(rows)
                self.metadata['columns']=list(actual_cols)

                labels=[row.get('label', '').strip() for row in rows]
                label_counts={}
                for label in labels:
                    label_counts[label]=label_counts.get(label, 0) + 1

                self.metadata['num_classes']=len(label_counts)
                self.metadata['labels']=list(label_counts.keys())
                self.metadata['samples_per_class']=label_counts

                text_lengths=[]
                for row in rows:
                    text=row.get('text', '')
                    if text:
                        tokens=len(text.split())
                        text_lengths.append(tokens)

                if text_lengths:
                    self.metadata['avg_text_length']=np.mean(text_lengths)
                    self.metadata['max_text_length']=max(text_lengths)
                    self.metadata['min_text_length']=min(text_lengths)

                    if max(text_lengths)>512:
                        self.warnings.append(f"Some texts exceed 512 tokens (max: {max(text_lengths)})")

                if len(rows)<min_samples:
                    self.warnings.append(f"Dataset has only {len(rows)} samples (recommended:>={min_samples})")

                counts=list(label_counts.values())
                if len(counts)>1:
                    min_count=min(counts)
                    max_count=max(counts)
                    imbalance=max_count/min_count
                    if imbalance>2.0:
                        self.warnings.append(f"Dataset is imbalanced (ratio: {imbalance:.1f}:1)")

                self.metadata['ready_for_training']=len(self.errors)==0

                status=ValidationStatus.INVALID if self.errors else (ValidationStatus.WARNING if self.warnings else ValidationStatus.VALID)
                return status, self._generate_report()

            except Exception as e:
                self.errors.append(f"Error reading CSV: {str(e)}")
                return ValidationStatus.INVALID, self._generate_report()

        return ValidationStatus.INVALID, self._generate_report()

    def validate_audio_dataset(
        self,
        data_path: str,
        sample_rate: int=16000,
        min_samples_per_class: int=10
    ) -> Tuple[ValidationStatus, Dict[str, Any]]:
        """
        Validate audio dataset for audio models.
        Expected structure: data_path/class_name/audio.wav
        """
        self.errors=[]
        self.warnings=[]
        self.metadata={}

        data_path=Path(data_path)
        if not data_path.exists() or not data_path.is_dir():
            self.errors.append(f"Dataset path does not exist: {data_path}")
            return ValidationStatus.INVALID, self._generate_report()

        try:
            class_dirs=[d for d in data_path.iterdir() if d.is_dir()]
            if not class_dirs:
                self.errors.append("No class directories found. Expected structure: dataset/class_name/audio.wav")
                return ValidationStatus.INVALID, self._generate_report()

            self.metadata['num_classes']=len(class_dirs)
            self.metadata['classes']=[d.name for d in class_dirs]
            self.metadata['samples_per_class']={}
            self.metadata['total_samples']=0

            for class_dir in class_dirs:
                class_name=class_dir.name
                valid_count=0

                for file in class_dir.iterdir():
                    if file.suffix.lower() in self.AUDIO_FORMATS:
                        valid_count+=1

                self.metadata['samples_per_class'][class_name]=valid_count
                self.metadata['total_samples']+=valid_count

                if valid_count<min_samples_per_class:
                    self.warnings.append(f"Class '{class_name}' has only {valid_count} audio files (recommended:>={min_samples_per_class})")

            self.metadata['ready_for_training']=len(self.errors)==0

            status=ValidationStatus.INVALID if self.errors else (ValidationStatus.WARNING if self.warnings else ValidationStatus.VALID)
            return status, self._generate_report()

        except Exception as e:
            self.errors.append(f"Unexpected error during validation: {str(e)}")
            return ValidationStatus.INVALID, self._generate_report()

    def _generate_report(self) -> Dict[str, Any]:
        """Generate validation report."""
        return {
            'status': ValidationStatus.INVALID if self.errors else (ValidationStatus.WARNING if self.warnings else ValidationStatus.VALID),
            'errors': self.errors,
            'warnings': self.warnings,
            'metadata': self.metadata,
            'summary': {
                'total_errors': len(self.errors),
                'total_warnings': len(self.warnings),
                'is_valid': len(self.errors)==0,
            }
        }


def validate_vision(data_path: str, required_shape: Tuple[int, int]) -> Dict[str, Any]:
    """Validate vision dataset."""
    validator=DataValidator()
    status, report=validator.validate_vision_dataset(data_path, required_shape)
    return report


def validate_nlp(data_path: str) -> Dict[str, Any]:
    """Validate NLP dataset."""
    validator=DataValidator()
    status, report=validator.validate_nlp_dataset(data_path)
    return report


def validate_audio(data_path: str) -> Dict[str, Any]:
    """Validate audio dataset."""
    validator=DataValidator()
    status, report=validator.validate_audio_dataset(data_path)
    return report
