import resend
from config import settings


def _client():
    resend.api_key = settings.resend_api_key
    return resend.Emails


def send_invite_email(to: str, link: str) -> None:
    if not settings.resend_api_key:
        print(f"[email] INVITE → {to}: {link}")
        return
    _client().send({
        "from": settings.email_from,
        "to": [to],
        "subject": "You've been invited to Fideon OS",
        "html": f'<p>You have been invited to join Fideon OS.</p><p><a href="{link}">Accept Invitation</a></p>',
    })


def send_otp_email(to: str, code: str) -> None:
    if not settings.resend_api_key:
        print(f"[email] OTP → {to}: {code}")
        return
    _client().send({
        "from": settings.email_from,
        "to": [to],
        "subject": "Your Fideon OS verification code",
        "html": f"<p>Your verification code is: <strong>{code}</strong></p><p>This code expires in {settings.otp_expiry_minutes} minutes.</p>",
    })


def send_reset_email(to: str, link: str) -> None:
    if not settings.resend_api_key:
        print(f"[email] RESET → {to}: {link}")
        return
    _client().send({
        "from": settings.email_from,
        "to": [to],
        "subject": "Reset your Fideon OS password",
        "html": f'<p>Click the link below to reset your password. This link expires in {settings.password_reset_expiry_minutes} minutes.</p><p><a href="{link}">Reset Password</a></p>',
    })


def send_new_device_alert(to: str, city: str | None = None, country: str | None = None) -> None:
    if not settings.resend_api_key:
        print(f"[email] NEW_DEVICE → {to}: {city}, {country}")
        return
    location = f"{city}, {country}" if city else (country or "Unknown location")
    _client().send({
        "from": settings.email_from,
        "to": [to],
        "subject": "New device sign-in to Fideon OS",
        "html": f"<p>A new device signed in to your Fideon OS account from <strong>{location}</strong>.</p><p>If this wasn't you, please change your password immediately.</p>",
    })


def send_security_alert(to: str) -> None:
    if not settings.resend_api_key:
        print(f"[email] SECURITY_ALERT → {to}")
        return
    _client().send({
        "from": settings.email_from,
        "to": [to],
        "subject": "Security alert: suspicious activity on your Fideon OS account",
        "html": "<p>We detected suspicious activity on your account and have logged you out of all sessions. Please log in again and change your password.</p>",
    })
