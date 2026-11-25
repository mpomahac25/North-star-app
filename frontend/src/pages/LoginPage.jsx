import AuthPanel from "../components/auth/AuthPanel";

export default function LoginPage({ onAuthenticated }) {
  return <AuthPanel mode="login" onAuthenticated={onAuthenticated} />;
}
