import { pantry } from "@/lib/demo";

export default function PantryPage() {
  return (
    <>
      <h1 className="page-title">Pantry</h1>
      <p className="subtle">Pantry, fridge and freezer stock.</p>
      <section className="card">
        <div className="list">
          {pantry.map((item) => (
            <div className="row" key={item.name}>
              <div>
                <strong>{item.name}</strong>
                <div className="subtle">{item.location}</div>
              </div>
              <div>
                <span className="badge">{item.quantity}</span>
                {item.useSoon && (
                  <span className="badge" style={{ marginLeft: 8 }}>
                    Use soon
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
