import AuthPanel from "../components/auth/AuthPanel";

export default function RegisterPage({ onAuthenticated }) {
  return <AuthPanel mode="register" onAuthenticated={onAuthenticated} />;
}
