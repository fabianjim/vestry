import LegalPage, { CONTACT_EMAIL } from '../components/legal/LegalPage'

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Vestry is a portfolio journal. This policy explains what we collect when you use it, why, and who
        helps us run it. We don't sell your data or use it for advertising.
      </p>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Account details: your username and a hashed password, or your Google account ID if you sign in with Google.</li>
          <li>What you enter: holdings, transactions, watchlist tickers, journal entries, tags and layout preferences.</li>
          <li>What we generate for you: AI briefings, insights and reflections based on your entries and portfolio.</li>
          <li>Basic usage data: anonymous, aggregated page views through Vercel Analytics, which does not use cookies.</li>
        </ul>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          We use a single session cookie to keep you signed in. We don't use advertising or tracking cookies.
        </p>
      </section>

      <section>
        <h2>How we use it</h2>
        <p>
          Only to run Vestry: to show your portfolio and journal, track prices for the tickers you hold,
          and produce the AI features you request. We don't use your entries to train AI models.
        </p>
      </section>

      <section>
        <h2>Services that process your data</h2>
        <ul>
          <li>Supabase (database) and Amazon Web Services (application servers) store and process your account data.</li>
          <li>Vercel hosts the website and provides anonymous analytics.</li>
          <li>OpenAI receives the relevant journal entries and portfolio facts when an AI feature runs. Under its API terms, this data is not used for training.</li>
          <li>Google, if you choose to sign in with Google.</li>
        </ul>
      </section>

      <section>
        <h2>The demo</h2>
        <p>
          The demo runs on a temporary copy of a sample account. Nothing you change in it is saved, and the
          copy is discarded after 30 minutes of inactivity.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          You can edit or delete your journal entries at any time. To get a copy of your data or delete your
          account, <a href={`mailto:${CONTACT_EMAIL}`}>email us</a> and we'll handle it promptly.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If this policy changes, we'll update the date above. Questions are welcome; just{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>email us</a>.
        </p>
      </section>
    </LegalPage>
  )
}
