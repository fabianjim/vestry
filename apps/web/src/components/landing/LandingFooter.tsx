import { Link } from 'react-router-dom'
import { GithubIcon, EnvelopeIcon } from '../icons'

export default function LandingFooter() {
  return (
    <footer className="py-8 px-6 text-center text-sm text-muted">
      <p className="font-90 mb-3">
        Vestry is open-source. If you would like to self-host please follow the instructions on the GitHub repository.
      </p>
      <div className="flex items-center justify-center gap-4">
        <a
          href="https://github.com/fabianjim/vestry"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
          aria-label="GitHub"
        >
          <GithubIcon className="w-4 h-4" />
        </a>
        <a
          href="mailto:hello@vestry.me"
          className="hover:text-foreground transition-colors"
          aria-label="Email"
        >
          <EnvelopeIcon className="w-4 h-4" />
        </a>
        <nav className="flex items-center gap-4" aria-label="Footer">
          <Link to="/product" className="hover:text-foreground transition-colors">Product</Link>
          <Link to="/updates" className="hover:text-foreground transition-colors">Updates</Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
        </nav>
      </div>
    </footer>
  )
}
