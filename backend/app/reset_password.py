"""Give one account a temporary password from the server shell.

The way back in when nobody can reset it in the app, for example the only
admin forgot their password:

    docker exec <backend-container> python -m app.reset_password <email>
"""
import sys

from app.core.auth_sessions import end_all_sessions
from app.database import SessionLocal
from app.models import User
from app.security import generate_temp_password, hash_password


def reset_password(email: str) -> str | None:
    """Return the temporary password, or None if no account uses ``email``."""
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email.strip().lower()).first()
        if user is None:
            return None
        temporary = generate_temp_password()
        user.password_hash = hash_password(temporary)
        user.must_change_password = True
        end_all_sessions(db, user)
        db.commit()
        return temporary


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("Usage: python -m app.reset_password <email>", file=sys.stderr)
        return 2
    temporary = reset_password(argv[0])
    if temporary is None:
        print(f"No account with email {argv[0]}", file=sys.stderr)
        return 1
    print(f"Temporary password for {argv[0]}: {temporary}")
    print("They must change it at their next sign-in. All their sessions were ended.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
