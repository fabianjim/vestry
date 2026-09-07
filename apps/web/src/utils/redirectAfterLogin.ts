import { portfolioApi } from '../services/api'

export async function redirectAfterLogin(navigate: (path: string) => void) {
  try {
    const hasPortfolio = await portfolioApi.portfolioExists() as boolean
    if (hasPortfolio) {
      navigate('/dashboard')
    } else {
      navigate('/portfolio')
    }
  } catch {
    navigate('/portfolio')
  }
}
