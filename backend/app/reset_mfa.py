"""Turn two-step sign-in off for one account from the server shell.

The way back in when nobody can reset it in the app, for example the only
admin lost both phone and recovery codes:

    docker exec <backend-container> python -m app.reset_mfa <email>
"""
import sys

from app.core import mfa
from app.database import SessionLocal
from app.models import User


def reset_mfa(email: str) -> bool:
    """Return False if no account uses ``email``."""
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email.strip().lower()).first()
        if user is None:
            return False
        mfa.disable_mfa(db, user)
        db.commit()
        return True


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("Usage: python -m app.reset_mfa <email>", file=sys.stderr)
        return 2
    if not reset_mfa(argv[0]):
        print(f"No account with email {argv[0]}", file=sys.stderr)
        return 1
    print(f"Two-step sign-in is off for {argv[0]}. They can sign in with their password now.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
