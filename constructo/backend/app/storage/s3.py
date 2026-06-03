"""S3-compatible storage (Cloudflare R2 in prod). Private bucket + presigned URLs.

The bucket is never public: ``url_for`` mints a short-lived presigned GET so the
extraction pipeline and the apps can fetch media, and ``presigned_put`` mints a
direct-upload ticket for the homeowner R1 flow. Only the object KEY is persisted
in ``media_url``.
"""
from __future__ import annotations

import boto3
from botocore.client import Config

from app.config import settings
from app.storage.base import PresignedUpload


class S3Storage:
    def __init__(self) -> None:
        missing = [
            name
            for name, val in (
                ("S3_ENDPOINT_URL", settings.s3_endpoint_url),
                ("S3_BUCKET", settings.s3_bucket),
                ("S3_ACCESS_KEY_ID", settings.s3_access_key_id),
                ("S3_SECRET_ACCESS_KEY", settings.s3_secret_access_key),
            )
            if not val
        ]
        if missing:
            raise RuntimeError(
                f"STORAGE_BACKEND=s3 but missing config: {', '.join(missing)}"
            )
        self._bucket = settings.s3_bucket
        self._ttl = settings.s3_presign_ttl
        # SigV4 + virtual-addressing 'path' style is the safe default for R2.
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            region_name=settings.s3_region,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    def put_bytes(self, key: str, data: bytes, content_type: str) -> str:
        self._client.put_object(
            Bucket=self._bucket, Key=key, Body=data, ContentType=content_type
        )
        return key

    def url_for(self, ref: str | None) -> str | None:
        if not ref:
            return ref
        ref = ref.strip()
        # Already a real URL (WhatsApp Cloud-API media, Unsplash stopgap, etc.).
        if ref.lower().startswith(("http://", "https://")):
            return ref
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": ref},
            ExpiresIn=self._ttl,
        )

    def presigned_put(self, key: str, content_type: str) -> PresignedUpload:
        url = self._client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self._bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=self._ttl,
        )
        return PresignedUpload(
            key=key,
            url=url,
            method="PUT",
            headers={"Content-Type": content_type},
            expires_in=self._ttl,
        )
