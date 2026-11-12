import LegalPage, { CONTACT_EMAIL } from '../components/legal/LegalPage'

export default function Terms() {
  return (
    <LegalPage title="Terms of Use">
      <p>
        By using Vestry you agree to these terms. If you don't agree, please don't use the service.
      </p>

      <section>
        <h2>What Vestry is</h2>
        <p>
          Vestry is a journal for recording and reflecting on your investment decisions. It is not a brokerage,
          trading platform or real-time data service, and it does not execute trades or hold assets.
        </p>
      </section>

      <section>
        <h2>Not investment advice</h2>
        <p>
          Nothing in Vestry, including AI-generated briefings, insights and reflections, is financial,
          investment, tax or legal advice. AI output can be wrong or incomplete. You are responsible for your
          own decisions.
        </p>
      </section>

      <section>
        <h2>Market data</h2>
        <p>
          Prices are fetched hourly during market hours and may be delayed, incomplete or inaccurate. Don't rely
          on them for trading.
        </p>
      </section>

      <section>
        <h2>Your account and content</h2>
        <ul>
          <li>Keep your login details secure; you're responsible for activity on your account.</li>
          <li>You own what you write. You let us store and process it only to provide the service.</li>
          <li>Don't misuse the service, attempt to access other accounts, or interfere with its operation.</li>
        </ul>
      </section>

      <section>
        <h2>Availability</h2>
        <p>
          Vestry is provided "as is", without warranties of any kind. Features may change, and the service may be
          interrupted or discontinued. We may suspend accounts that violate these terms.
        </p>
      </section>

      <section>
        <h2>Limitation of liability</h2>
        <p>
          To the extent permitted by law, Vestry and its maintainers are not liable for any losses arising from
          your use of the service, including investment losses or loss of data.
        </p>
      </section>

      <section>
        <h2>Open source</h2>
        <p>
          Vestry's source code is available on{' '}
          <a href="https://github.com/fabianjim/vestry" target="_blank" rel="noopener noreferrer">GitHub</a>{' '}
          under its own license. These terms cover the hosted service at vestry.me.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update these terms and will change the date above when we do. Questions? Just{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>email us</a>.
        </p>
      </section>
    </LegalPage>
  )
}
