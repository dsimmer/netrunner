// Gravatar avatar component.
// Mirrors: src/cljs/nr/avatar.cljs
import React from "react";

interface AvatarUser {
  emailhash?: string;
  username?: string;
}

interface AvatarOpts {
  size?: number;
}

function AvatarImpl({ user, opts }: { user: AvatarUser; opts?: AvatarOpts }): React.ReactElement | null {
  if (!user.emailhash) return null;
  return (
    <img
      className="avatar"
      src={`https://www.gravatar.com/avatar/${user.emailhash}?d=retro&s=${opts?.size ?? 38}`}
      alt={user.username}
    />
  );
}

export const Avatar = React.memo(AvatarImpl);
export default Avatar;
